import { SYMBOL_NAMES } from './game/symbols';
import './style.css';
import { SlotScene } from './game/slot-scene';
import { GameSocket, type ConnectionState } from './network/game-socket';

const root = document.querySelector<HTMLDivElement>('#app')!;
root.innerHTML = `
  <header class="topbar">
    <a class="brand" href="./" aria-label="Orbit home"><span class="brand-icon">◉</span> orbit<span class="brand-dot">.</span></a>
    <div class="workspace-label"><span></span> LIVEOPS PLAYGROUND</div>
    <span class="demo-tag">DEMO MODE</span>
  </header>
  <main>
    <div class="breadcrumb">PLAYGROUND <span>/</span> BASE GAMES <span>/</span> <b>ORBIT NUMBERS</b></div>
    <div class="heading"><div><p class="eyebrow">A LITTLE LUCK. ENDLESS POSSIBILITIES.</p><h1>Orbit Numbers<span>™</span></h1><p class="intro">Three reels. Ten symbols. Find your winning combination.</p></div><div class="connection" role="status"><i></i><span id="connection-text">Connecting</span></div></div>
    <div class="layout">
      <section class="machine" aria-label="Slot game">
        <div class="machine-heading"><span class="game-chip">01 <span>CLASSIC SLOT</span></span><span class="ways-badge">✳ &nbsp; 27 WAYS TO WIN</span></div>
        <div class="reel-shell"><div class="reel-top"><span>O R B I T</span><span>3 × 3</span></div><div id="reels" role="img" aria-label="Slot reels. Press spin to play."></div><div class="reel-bottom"><span>●</span><span>●</span><span>●</span></div></div>
        <div class="result-line" aria-live="polite"><span id="result-icon">✦</span><span id="result-text">Your next combination is one spin away.</span></div>
        <div class="controls"><div class="stat"><span>LAST WIN</span><strong id="last-win">— <small>ways</small></strong></div><button id="spin" disabled><span class="spin-icon">↻</span><span id="spin-label">CONNECTING</span><span class="key-hint">↵</span></button><div class="stat right"><span>SESSION SPINS</span><strong id="spin-count">00</strong></div></div>
        <div class="machine-footer"><span><i></i> SERVER-GENERATED RESULTS</span><span>JUST FOR PLAY · NO REAL MONEY</span></div>
      </section>
      <aside>
        <section class="info-card"><div class="card-kicker"><span class="tiny-icon">↗</span> THE PLAYBOOK</div><h2>Every way counts.</h2><p>Match the same symbol across all three reels. Any row connects to any row.</p><div class="way-example" aria-hidden="true"><span class="example-symbol"></span><i></i><span class="example-symbol"></span><i></i><span class="example-symbol"></span></div><div class="formula"><strong>3 × 3 × 3</strong><span>27 possible ways</span></div><p class="footnote">More matching symbols on a reel means more winning combinations.</p></section>
        <section class="info-card recent-card"><div class="card-kicker">YOUR SESSION <span class="live-dot"></span></div><h2>Recent spins</h2><ol id="history"><li class="empty-history">A fresh start.<br><span>Your results will appear here.</span></li></ol></section>
        <p class="aside-note">Built for the moment.<br>Powered by LiveOps.</p>
      </aside>
    </div>
    <footer><span>ORBIT / LIVEOPS LAB</span><span>PROOF OF CONCEPT <b>·</b> 001</span></footer>
  </main>`;

const button = document.querySelector<HTMLButtonElement>('#spin')!;
const label = document.querySelector('#spin-label')!;
const resultText = document.querySelector('#result-text')!;
const reelsHost = document.querySelector<HTMLElement>('#reels')!;
const history = document.querySelector('#history')!;
let state: ConnectionState = 'connecting';
let busy = false;
let ready = false;
let count = 0;
const scene = new SlotScene();
function updateButton() {
  button.disabled = !ready || busy || state !== 'connected';
  label.textContent = busy ? 'SPINNING' : state === 'connected' ? 'SPIN' : state === 'connecting' ? 'CONNECTING' : 'OFFLINE';
  button.classList.toggle('spinning', busy);
}
const url = import.meta.env.VITE_GAME_WS_URL || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:5555/ws/games`;
const socket = new GameSocket(url, (next) => {
  state = next;
  document.querySelector('.connection')!.setAttribute('data-state', next);
  document.querySelector('#connection-text')!.textContent = next === 'connected' ? 'Connected' : next === 'connecting' ? 'Connecting' : 'Reconnecting';
  if (!busy) resultText.textContent = next === 'connected' ? 'Your next combination is one spin away.' : 'Waiting for core-api. Reconnecting automatically…';
  updateButton();
});

button.addEventListener('click', async () => {
  if (busy || !ready || state !== 'connected') return;
  busy = true;
  updateButton();
  document.querySelector('.result-line')!.classList.remove('is-win', 'is-error');
  resultText.textContent = 'Reels in motion…';
  reelsHost.setAttribute('aria-label', 'Reels spinning. Waiting for the server result.');
  scene.start();
  try {
    const result = await socket.spin();
    resultText.textContent = 'Finding your combination…';
    await scene.settle(result);
    count++;
    document.querySelector('#spin-count')!.textContent = String(count).padStart(2, '0');
    document.querySelector('#last-win')!.innerHTML = `${result.winCount} <small>ways</small>`;
    const summary = result.winCount > 0 ? `${result.winCount} winning ${result.winCount === 1 ? 'way' : 'ways'}. Nicely done!` : 'No matching ways this time. Give it another spin.';
    resultText.textContent = summary;
    document.querySelector('.result-line')!.classList.toggle('is-win', result.winCount > 0);
    reelsHost.setAttribute('aria-label', `Result, rows top to bottom: ${result.matrix.map((row) => row.map((id) => SYMBOL_NAMES[id]).join(', ')).join('; ')}. ${summary}`);
    history.querySelector('.empty-history')?.remove();
    const item = document.createElement('li');
    item.innerHTML = `<span class="history-number">${String(count).padStart(2, '0')}</span><span>Spin complete</span><strong class="${result.winCount ? 'won' : ''}">${result.winCount} ways</strong>`;
    history.prepend(item);
    if (history.children.length > 5) history.lastElementChild?.remove();
  } catch (error) {
    scene.cancel();
    resultText.textContent = error instanceof Error ? error.message : 'Unable to complete the spin.';
    document.querySelector('.result-line')!.classList.add('is-error');
    reelsHost.setAttribute('aria-label', 'Spin failed. Showing the previous board.');
  } finally { busy = false; updateButton(); }
});

scene.init(reelsHost).then(() => { ready = true; updateButton(); }).catch(() => {
  resultText.textContent = 'The game could not load. Check your connection and WebGL support, then reload.';
  document.querySelector('.result-line')!.classList.add('is-error');
});

if (import.meta.hot) import.meta.hot.dispose(() => { socket.dispose(); if (ready) scene.destroy(); });
window.addEventListener('pagehide', () => socket.dispose(), { once: true });
