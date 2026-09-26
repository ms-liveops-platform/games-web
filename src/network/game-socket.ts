export type Matrix = [number[], number[], number[]];
export interface Win {
  id: number;
  positions: { row: number; reel: number }[];
  symbols: number[];
}
export interface SpinResult {
  spinId: string;
  matrix: Matrix;
  wins: Win[];
  winCount: number;
  bet: number;
  payout: number;
  balance: number;
}
export interface Player {
  id: string;
  displayName: string;
  balance: number;
  status: "active" | "archived";
}
function validPlayer(p: unknown): p is Player {
  if (!p || typeof p !== "object") return false;
  const value = p as Player;
  return (
    typeof value.id === "string" &&
    typeof value.displayName === "string" &&
    Number.isSafeInteger(value.balance) &&
    value.balance >= 0 &&
    ["active", "archived"].includes(value.status)
  );
}
export type ConnectionState = "connecting" | "connected" | "disconnected";

export function isSpinResult(value: unknown): value is SpinResult {
  if (!value || typeof value !== "object") return false;
  const result = value as SpinResult;
  const symbol = (n: unknown) =>
    Number.isInteger(n) && Number(n) >= 0 && Number(n) <= 9;
  return (
    result.bet === 1 &&
    Number.isSafeInteger(result.payout) &&
    result.payout >= 0 &&
    Number.isSafeInteger(result.balance) &&
    result.balance >= 0 &&
    typeof result.spinId === "string" &&
    Array.isArray(result.matrix) &&
    result.matrix.length === 3 &&
    result.matrix.every(
      (row) => Array.isArray(row) && row.length === 3 && row.every(symbol),
    ) &&
    Array.isArray(result.wins) &&
    result.wins.length <= 27 &&
    result.winCount === result.wins.length &&
    result.wins.every(
      (win) =>
        win &&
        Number.isInteger(win.id) &&
        win.id >= 0 &&
        win.id < 27 &&
        Array.isArray(win.positions) &&
        win.positions.length === 3 &&
        win.positions.every(
          (p, reel) =>
            p &&
            p.reel === reel &&
            Number.isInteger(p.row) &&
            p.row >= 0 &&
            p.row < 3,
        ) &&
        Array.isArray(win.symbols) &&
        win.symbols.length === 3 &&
        win.symbols.every(symbol) &&
        win.symbols.every(
          (s, reel) =>
            s === win.symbols[0] &&
            result.matrix[win.positions[reel].row][reel] === s,
        ),
    )
  );
}

export class GameSocket {
  private socket: WebSocket | null = null;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private handshake: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;
  private sessionReady = false;
  private sessionId = "";
  private playerId: string | undefined;
  private token: string | undefined;
  private unresolved: string | undefined;
  private pending: {
    id: string;
    resolve: (result: SpinResult) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;

  constructor(
    private url: string,
    private onState: (state: ConnectionState) => void,
    private onPlayer: (player: Player) => void = () => {},
    private onError: (message: string) => void = () => {},
  ) {
    try {
      const params = new URLSearchParams(location.hash.slice(1));
      const saved = JSON.parse(localStorage.getItem("orbit.player") || "{}");
      this.playerId = params.get("playerId") || saved.playerId;
      this.token = params.get("token") || saved.token;
      if (params.has("playerId"))
        history.replaceState(null, "", location.pathname + location.search);
      const pending = JSON.parse(
        localStorage.getItem("orbit.pendingSpin") || "{}",
      );
      if (pending.playerId === this.playerId)
        this.unresolved = pending.requestId;
    } catch {
      /* Storage may be unavailable; a new demo session still works. */
    }
    this.connect();
  }

  private connect() {
    if (this.disposed) return;
    this.sessionReady = false;
    this.onState("connecting");
    try {
      this.socket = new WebSocket(this.url);
    } catch {
      this.reconnect();
      return;
    }
    const socket = this.socket;
    socket.onopen = () => {
      this.sessionId = crypto.randomUUID();
      socket.send(
        JSON.stringify({
          type: "session.open",
          requestId: this.sessionId,
          playerId: this.playerId,
          token: this.token,
        }),
      );
      this.handshake = setTimeout(() => {
        this.onError("Player session timed out. Reconnecting…");
        socket.close();
      }, 8000);
    };
    socket.onerror = () => socket.close();
    socket.onclose = () => {
      clearTimeout(this.handshake);
      this.sessionReady = false;
      this.fail(
        "Connection lost. Retry to recover the same spin without another charge.",
      );
      this.reconnect();
    };
    socket.onmessage = (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        this.fail("The server returned an unreadable response.");
        return;
      }
      if (!message) return;
      if (message.requestId === this.sessionId && !this.sessionReady) {
        clearTimeout(this.handshake);
        if (
          message.type === "session.ready" &&
          validPlayer(message.player) &&
          typeof message.token === "string"
        ) {
          this.playerId = message.player.id;
          this.token = message.token;
          this.sessionReady = true;
          try {
            localStorage.setItem(
              "orbit.player",
              JSON.stringify({ playerId: this.playerId, token: this.token }),
            );
          } catch {
            /* Optional persistence. */
          }
          this.onPlayer(message.player);
          this.onState("connected");
        } else {
          this.onError(
            message.error?.message || "Unable to open player session.",
          );
          socket.close();
        }
        return;
      }
      if (message.type === "player.updated" && validPlayer(message.player)) {
        this.onPlayer(message.player);
        return;
      }
      if (!this.pending || message.requestId !== this.pending.id) return;
      if (message.type === "error") {
        if (
          [
            "INSUFFICIENT_BALANCE",
            "PLAYER_ARCHIVED",
            "SESSION_REQUIRED",
          ].includes(message.error?.code)
        )
          this.clearUnresolved();
        this.fail(message.error?.message || "Spin failed.");
        return;
      }
      if (
        message.type !== "slot.result" ||
        !isSpinResult(message.result) ||
        !validPlayer(message.player)
      ) {
        this.fail("The server returned an invalid spin result.");
        return;
      }
      const pending = this.pending;
      this.pending = null;
      clearTimeout(pending.timer);
      this.clearUnresolved();
      this.onPlayer(message.player);
      pending.resolve(message.result);
    };
  }

  private clearUnresolved() {
    this.unresolved = undefined;
    try {
      localStorage.removeItem("orbit.pendingSpin");
    } catch {
      /* Optional persistence. */
    }
  }
  private reconnect() {
    this.onState("disconnected");
    if (!this.disposed) this.retry = setTimeout(() => this.connect(), 2000);
  }
  private fail(message: string) {
    if (!this.pending) return;
    clearTimeout(this.pending.timer);
    this.pending.reject(new Error(message));
    this.pending = null;
  }
  spin(): Promise<SpinResult> {
    if (this.socket?.readyState !== WebSocket.OPEN || !this.sessionReady)
      return Promise.reject(new Error("Connect to core-api before spinning."));
    if (this.pending)
      return Promise.reject(new Error("A spin is already in progress."));
    return new Promise((resolve, reject) => {
      const id = this.unresolved || crypto.randomUUID();
      this.unresolved = id;
      try {
        localStorage.setItem(
          "orbit.pendingSpin",
          JSON.stringify({ playerId: this.playerId, requestId: id }),
        );
      } catch {
        /* In-memory recovery remains available. */
      }
      this.pending = {
        id,
        resolve,
        reject,
        timer: setTimeout(
          () =>
            this.fail(
              "Spin timed out. Retry to recover the same result without another charge.",
            ),
          8000,
        ),
      };
      try {
        this.socket!.send(JSON.stringify({ type: "slot.spin", requestId: id }));
      } catch {
        this.fail("Could not send the spin request.");
      }
    });
  }
  dispose() {
    this.disposed = true;
    clearTimeout(this.retry);
    clearTimeout(this.handshake);
    this.fail("Game closed.");
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.onopen = null;
      this.socket.onerror = null;
      this.socket.onmessage = null;
      this.socket.close();
    }
  }
}
