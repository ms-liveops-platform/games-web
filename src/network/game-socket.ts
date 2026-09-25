export type Matrix = [number[], number[], number[]];
export interface Win {
  id: number;
  positions: { row: number; reel: number }[];
  symbols: number[];
}
export interface SpinResult { spinId: string; matrix: Matrix; wins: Win[]; winCount: number }
export type ConnectionState = 'connecting' | 'connected' | 'disconnected';

export function isSpinResult(value: unknown): value is SpinResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as SpinResult;
  const symbol = (n: unknown) => Number.isInteger(n) && Number(n) >= 0 && Number(n) <= 9;
  return typeof result.spinId === 'string' && Array.isArray(result.matrix) && result.matrix.length === 3 &&
    result.matrix.every((row) => Array.isArray(row) && row.length === 3 && row.every(symbol)) &&
    Array.isArray(result.wins) && result.wins.length <= 27 && result.winCount === result.wins.length &&
    result.wins.every((win) => win && Number.isInteger(win.id) && win.id >= 0 && win.id < 27 &&
      Array.isArray(win.positions) && win.positions.length === 3 &&
      win.positions.every((p, reel) => p && p.reel === reel && Number.isInteger(p.row) && p.row >= 0 && p.row < 3) &&
      Array.isArray(win.symbols) && win.symbols.length === 3 && win.symbols.every(symbol) &&
      win.symbols.every((s, reel) => s === win.symbols[0] && result.matrix[win.positions[reel].row][reel] === s));
}

export class GameSocket {
  private socket: WebSocket | null = null;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;
  private pending: { id: string; resolve: (result: SpinResult) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> } | null = null;

  constructor(private url: string, private onState: (state: ConnectionState) => void) { this.connect(); }

  private connect() {
    if (this.disposed) return;
    this.onState('connecting');
    try { this.socket = new WebSocket(this.url); }
    catch { this.reconnect(); return; }
    const socket = this.socket;
    socket.onopen = () => this.onState('connected');
    socket.onerror = () => socket.close();
    socket.onclose = () => {
      this.fail('Connection lost. This spin was not recovered.');
      this.reconnect();
    };
    socket.onmessage = (event) => {
      let message;
      try { message = JSON.parse(event.data); }
      catch { this.fail('The server returned an unreadable response.'); return; }
      if (!message || !this.pending || message.requestId !== this.pending.id) return;
      if (message.type === 'error') { this.fail(message.error?.message || 'Spin failed.'); return; }
      if (message.type !== 'slot.result' || !isSpinResult(message.result)) {
        this.fail('The server returned an invalid spin result.'); return;
      }
      const pending = this.pending;
      this.pending = null;
      clearTimeout(pending.timer);
      pending.resolve(message.result);
    };
  }

  private reconnect() {
    this.onState('disconnected');
    if (!this.disposed) this.retry = setTimeout(() => this.connect(), 2000);
  }

  private fail(message: string) {
    if (!this.pending) return;
    clearTimeout(this.pending.timer);
    this.pending.reject(new Error(message));
    this.pending = null;
  }

  spin(): Promise<SpinResult> {
    if (this.socket?.readyState !== WebSocket.OPEN) return Promise.reject(new Error('Connect to core-api before spinning.'));
    if (this.pending) return Promise.reject(new Error('A spin is already in progress.'));
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      this.pending = { id, resolve, reject, timer: setTimeout(() => this.fail('Spin timed out. No result was confirmed.'), 8000) };
      try { this.socket!.send(JSON.stringify({ type: 'slot.spin', requestId: id })); }
      catch { this.fail('Could not send the spin request.'); }
    });
  }

  dispose() {
    this.disposed = true;
    clearTimeout(this.retry);
    this.fail('Game closed.');
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.onopen = null;
      this.socket.onerror = null;
      this.socket.onmessage = null;
      this.socket.close();
    }
  }
}
