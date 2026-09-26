import { awardPath, type MiniAward } from "./mini/config";
import { SYMBOL_NAMES, SYMBOL_ATLAS_URL } from "./game/symbols";
import "./style.css";
import { SlotScene } from "./game/slot-scene";
import {
  GameSocket,
  type ConnectionState,
  type SpinResult,
  type Player,
} from "./network/game-socket";

const root = document.querySelector<HTMLDivElement>("#app")!;
root.innerHTML = `
  <main class="game-layout">
    <section class="machine" aria-label="Slot game">
      <div class="player-bar"><span id="player-name">Connecting…</span><span><strong id="balance">—</strong> credits · Bet 1</span></div>
      <div id="reels" role="img" aria-label="Slot reels. Press spin to play."></div>
      <button id="spin" disabled><span class="spin-icon" aria-hidden="true">↻</span><span id="spin-label">CONNECTING</span></button>
    </section>
    <section class="history-panel" aria-labelledby="history-title">
      <h1 id="history-title">Spin history</h1>
      <ol id="history"><li class="empty-history">No spins yet</li></ol>
    </section>
    <p id="status" class="sr-only" role="status" aria-live="polite"></p>
  </main>`;

// Scale the entire composition uniformly; never reflow its internal layout.
function resize() {
  root.style.setProperty(
    "--game-scale",
    String(Math.min(root.clientWidth / 1000, root.clientHeight / 600)),
  );
}
const observer = new ResizeObserver(resize);
observer.observe(root);
resize();

const button = document.querySelector<HTMLButtonElement>("#spin")!;
const label = document.querySelector("#spin-label")!;
const status = document.querySelector("#status")!;
const reelsHost = document.querySelector<HTMLElement>("#reels")!;
const history = document.querySelector("#history")!;
let player: Player | null = null;
let state: ConnectionState = "connecting";
let busy = false;
let ready = false;
let loadFailed = false;
let retry = false;
let count = 0;
let pendingAwards: MiniAward[] = [];
let openingBonus = false;
function openPendingBonus() {
  if (openingBonus || busy || !ready || state !== 'connected' || player?.status !== 'active' || !pendingAwards.length) return;
  openingBonus = true;
  location.assign(awardPath(pendingAwards[0]));
}
const scene = new SlotScene();
function updateButton() {
  button.disabled =
    !ready || busy || state !== "connected" || player?.status === "archived";
  label.textContent = loadFailed
    ? "RELOAD REQUIRED"
    : busy
      ? "SPINNING"
      : state !== "connected"
        ? "CONNECTING"
        : !ready
          ? "LOADING"
          : retry
            ? "TRY AGAIN"
            : "SPIN";
  button.classList.toggle("spinning", busy);
}
const url =
  import.meta.env.VITE_GAME_WS_URL ||
  `${location.protocol === "https:" ? "wss" : "ws"}://${location.hostname}:5555/ws/games`;
const socket = new GameSocket(
  url,
  (next) => {
    state = next;
    if (!busy)
      status.textContent =
        next === "connected"
          ? "Connected. Ready to spin."
          : "Reconnecting automatically…";
    updateButton();
    openPendingBonus();
  },
  (updated) => {
    player = updated;
    document.querySelector("#player-name")!.textContent = updated.displayName;
    document.querySelector("#balance")!.textContent =
      updated.balance.toLocaleString();
    updateButton();
  },
  (message) => {
    status.textContent = message;
    button.title = message;
  },
  (awards) => { pendingAwards = awards; openPendingBonus(); },
);

function addHistory(result: SpinResult) {
  history.querySelector(".empty-history")?.remove();
  const item = document.createElement("li");
  item.className = result.winCount ? "history-entry won" : "history-entry";
  const heading = document.createElement("div");
  heading.className = "history-heading";
  heading.innerHTML = `<span>Spin ${String(count).padStart(2, "0")}</span><strong>${result.winCount ? `+${result.payout} credits · ${result.winCount} ways` : "No win"}</strong>`;
  item.append(heading);
  const groups = new Map<number, number>();
  for (const win of result.wins) {
    const symbol = win.symbols[0];
    groups.set(symbol, (groups.get(symbol) ?? 0) + 1);
  }
  for (const [symbol, ways] of groups) {
    const group = document.createElement("div");
    group.className = "winning-symbols";
    group.setAttribute(
      "aria-label",
      `${SYMBOL_NAMES[symbol]}: ${ways} winning ${ways === 1 ? "way" : "ways"}`,
    );
    for (let reel = 0; reel < 3; reel++) {
      const icon = document.createElement("span");
      icon.className = "history-symbol";
      icon.setAttribute("aria-hidden", "true");
      icon.style.backgroundImage = `url('${SYMBOL_ATLAS_URL}')`;
      icon.style.backgroundPosition = `${(symbol % 5) * 25}% ${Math.floor(symbol / 5) * 100}%`;
      group.append(icon);
    }
    const label = document.createElement("span");
    label.className = "symbol-count";
    label.textContent = `× ${ways}`;
    group.append(label);
    group.title = `${SYMBOL_NAMES[symbol]} — ${ways} winning ${ways === 1 ? "way" : "ways"}`;
    item.append(group);
  }
  history.prepend(item);
  history.scrollTop = 0;
  if (history.children.length > 50) history.lastElementChild?.remove();
}

button.addEventListener("click", async () => {
  if (busy || !ready || state !== "connected") return;
  busy = true;
  retry = false;
  button.title = "";
  updateButton();
  status.textContent = "Reels spinning.";
  reelsHost.setAttribute(
    "aria-label",
    "Reels spinning. Waiting for the server result.",
  );
  scene.start();
  try {
    const result = await socket.spin();
    await scene.settle(result);
    count++;
    const summary = result.winCount
      ? `${result.winCount} winning ${result.winCount === 1 ? "way" : "ways"}.`
      : "No win.";
    status.textContent = summary;
    reelsHost.setAttribute(
      "aria-label",
      `Result, rows top to bottom: ${result.matrix.map((row) => row.map((id) => SYMBOL_NAMES[id]).join(", ")).join("; ")}. ${summary}`,
    );
    addHistory(result);
  } catch (error) {
    scene.cancel();
    retry = true;
    const message =
      error instanceof Error ? error.message : "Unable to complete the spin.";
    status.textContent = message;
    button.title = message;
    reelsHost.setAttribute(
      "aria-label",
      "Spin failed. Showing the previous board.",
    );
  } finally {
    busy = false;
    updateButton();
    openPendingBonus();
  }
});

scene
  .init(reelsHost)
  .then(() => {
    ready = true;
    updateButton();
    openPendingBonus();
  })
  .catch(() => {
    loadFailed = true;
    status.textContent =
      "The game could not load. Check your connection and WebGL support, then reload.";
    button.title = status.textContent;
    updateButton();
  });

if (import.meta.hot)
  import.meta.hot.dispose(() => {
    observer.disconnect();
    socket.dispose();
    if (ready) scene.destroy();
  });
window.addEventListener("pagehide", () => socket.dispose(), { once: true });
