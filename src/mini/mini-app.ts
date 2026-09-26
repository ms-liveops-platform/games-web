import { gsap } from 'gsap';
import { GameSocket, type Player } from '../network/game-socket';
import { configFromUrl, defaultConfig, prizeLabel, validOutcome, type MiniAward, type MiniConfig, type MiniOutcome, type MiniType } from './config';
import './mini.css';

const escapeText = (text: string) => text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
function chestArt(index: number) {
  return `<svg viewBox="0 0 180 170" aria-hidden="true"><defs><linearGradient id="gold-${index}" x2="1" y2="1"><stop stop-color="#ffe1a0"/><stop offset=".45" stop-color="#b67a30"/><stop offset="1" stop-color="#f5c96c"/></linearGradient><linearGradient id="wood-${index}" x2="0" y2="1"><stop stop-color="#805235"/><stop offset="1" stop-color="#36241f"/></linearGradient></defs><ellipse cx="90" cy="147" rx="66" ry="10" fill="#000" opacity=".25"/><g class="treasure" opacity="0"><path d="M90 18 130 65 90 101 50 65Z" fill="#8bdcc8"/><path d="m90 18-12 47 12 36 12-36Z" fill="#dcfff0"/><path d="m50 65 80 0M90 18 78 65 90 101 102 65Z" fill="none" stroke="#fff" opacity=".4"/><circle cx="42" cy="47" r="4" fill="#ffdb8b"/><circle cx="140" cy="37" r="3" fill="#ffdb8b"/></g><path d="M30 83h120v58l-12 10H42l-12-10Z" fill="url(#wood-${index})" stroke="#efc174" stroke-width="3"/><path d="M47 86v60m86-60v60M31 131h118" stroke="url(#gold-${index})" stroke-width="10"/><g class="chest-lid"><path d="M26 86V60q0-36 36-36h56q36 0 36 36v26Z" fill="url(#wood-${index})" stroke="#edc074" stroke-width="3"/><path d="M45 85V57q0-22 18-27m72 55V57q0-22-18-27M27 76h126" fill="none" stroke="url(#gold-${index})" stroke-width="10"/><path d="M80 73h20v31H80Z" fill="url(#gold-${index})" stroke="#ffe1a0" stroke-width="2"/><circle cx="90" cy="85" r="4" fill="#3a322c"/><path d="m88 86-2 7h8l-2-7" fill="#3a322c"/></g></svg>`;
}
function wheelArt(config: MiniConfig) {
  const point = (r: number, angle: number) => `${260 + r * Math.cos((angle - 90) * Math.PI / 180)},${260 + r * Math.sin((angle - 90) * Math.PI / 180)}`;
  const count = config.prizes.length;
  const colors = ['#294d50', '#b28249', '#46567c', '#52776c'];
  return `<svg class="wheel" viewBox="0 0 520 520" role="img" aria-label="Prize wheel"><circle cx="260" cy="260" r="250" fill="#121e27" stroke="#c6a46c" stroke-width="2"/>${Array.from({length:48}, (_, i) => `<circle cx="${point(239,i*7.5).split(',')[0]}" cy="${point(239,i*7.5).split(',')[1]}" r="2" fill="#ebcb8d" opacity=".7"/>`).join('')}<g class="wheel-rotor">${config.prizes.map((prize, i) => {
    const start = i * 360 / count; const end = (i + 1) * 360 / count;
    const [x,y] = point(166, (start + end) / 2).split(',').map(Number);
    return `<path d="M260 260L${point(224,start)}A224 224 0 ${end-start>180?1:0} 1 ${point(224,end)}Z" fill="${colors[i % colors.length]}" stroke="#e8cea34a" stroke-width="1.5"/><text x="${x}" y="${y}" fill="#fff5d9" text-anchor="middle" dominant-baseline="middle" font-family="Georgia,serif" font-size="${count > 10 ? 19 : 28}" font-weight="bold">${escapeText(prizeLabel(config,prize.amount))}</text>${prize.label ? `<text x="${x}" y="${y+22}" fill="#f4e6cf" text-anchor="middle" font-family="Arial" font-size="9">${escapeText(prize.label)}</text>` : ''}`;
  }).join('')}</g><circle cx="260" cy="260" r="45" fill="#15232d" stroke="#d8b57e" stroke-width="3"/><circle cx="260" cy="260" r="34" fill="none" stroke="#d8b57e66"/><text x="260" y="273" text-anchor="middle" font-size="36" fill="#f8d999">✦</text><path d="M242 7h36l-18 36Z" fill="#f2d297" stroke="#fff0c7" stroke-width="2"/></svg>`;
}
function previewPlay(url: string, type: MiniType, config: MiniConfig, choiceIndex?: number): Promise<MiniOutcome> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const requestId = crypto.randomUUID();
    const timer = setTimeout(() => finish(new Error('Preview timed out. Check that core-api is running.')), 8000);
    let completed = false;
    function finish(error?: Error, outcome?: MiniOutcome) {
      if (completed) return; completed = true; clearTimeout(timer); socket.close();
      if (error) reject(error); else resolve(outcome!);
    }
    socket.onopen = () => socket.send(JSON.stringify({ type: 'mini.preview', requestId, game: type, config, ...(choiceIndex === undefined ? {} : { choiceIndex }) }));
    socket.onmessage = (event) => {
      try {
        const m = JSON.parse(event.data); if (m.requestId !== requestId) return;
        if (m.type !== 'mini.result' || !validOutcome(type,config,m.outcome)) finish(new Error(m.error?.message || 'Invalid preview result.'));
        else finish(undefined,m.outcome);
      } catch { finish(new Error('Invalid server response.')); }
    };
    socket.onerror = () => finish(new Error('Cannot reach core-api for the preview.'));
    socket.onclose = () => { if (!completed) finish(new Error('Preview connection closed.')); };
  });
}

export function mountMiniGame(type: MiniType) {
  const query = new URLSearchParams(location.search);
  const awardId = query.get('awardId');
  const names = { wheel: 'Lucky<br><em>Wheel.</em>', chests: 'Lucky<br><em>Chests.</em>', targets: 'Grumpy<br><em>Birds.</em>', scratch: 'Scratch<br><em>& Reveal.</em>' };
  const itemName = {wheel:'sectors', chests:'chests', targets:'birds', scratch:'zones'}[type];
  const instruction = {wheel:'Your bonus spin is ready.',chests:'Choose one chest to reveal your prize.',targets:'Hit the birds before the countdown ends.',scratch:'Scratch one zone to reveal your prize.'}[type];
  const root = document.querySelector<HTMLDivElement>('#app')!;
  let config: MiniConfig = defaultConfig(type);
  let configError = '';
  if (!awardId) { try { config = configFromUrl(type, query); } catch (e) { configError = e instanceof Error ? e.message : 'Invalid game parameters.'; } }
  root.innerHTML = `<main class="bonus-stage"><div class="bonus-art" id="bonus-art"></div><section class="bonus-details"><p class="bonus-eyebrow">${awardId ? 'YOUR EXCLUSIVE BONUS' : 'TRY YOUR LUCK · PREVIEW'}</p><h1>${names[type]}</h1><p class="bonus-description">${instruction}</p><div id="prize-summary" class="prize-summary"></div><div id="mini-result" class="mini-result" role="status" aria-live="polite">${awardId ? 'Loading your award…' : 'Your moment of luck awaits.'}</div><button id="mini-action" class="mini-action" disabled>${type === 'wheel' ? 'SPIN THE WHEEL' : 'PICK A CHEST'}</button><p id="mini-player" class="mini-player">${awardId ? 'Connecting your player session…' : 'Preview only · no balance changes'}</p><a class="back-link" href="/">← Back to slot</a></section></main>`;
  const art = document.querySelector<HTMLDivElement>('#bonus-art')!;
  const summary = document.querySelector('#prize-summary')!;
  const result = document.querySelector('#mini-result')!;
  const action = document.querySelector<HTMLButtonElement>('#mini-action')!;
  const playerLabel = document.querySelector('#mini-player')!;
  let socket: GameSocket | null = null;
  let connected = !awardId;
  let busy = false;
  let done = false;
  let loaded = !awardId && !configError;
  let loading = false;
  let disposed = false;
  let choice: number | undefined;
  let authoritativeAward: MiniAward | null = null;
  let rotation: gsap.core.Tween | null = null;
  let outcomeTween: gsap.core.Tween | null = null;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const url = import.meta.env.VITE_GAME_WS_URL || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:5555/ws/games`;
  const resize = () => root.style.setProperty('--bonus-scale', String(Math.min(root.clientWidth/1000, root.clientHeight/600)));
  const observer = new ResizeObserver(resize); observer.observe(root); resize();
  function update() {
    action.disabled = busy || !loaded || !connected || (!!awardId && authoritativeAward?.status === 'revoked') || (!done && type !== 'wheel' && choice === undefined);
    action.textContent = busy ? (type === 'wheel' ? 'SPINNING…' : 'REVEALING…') : done ? (awardId ? 'CONTINUE TO SLOT' : 'PLAY AGAIN') : type === 'wheel' ? 'SPIN THE WHEEL' : choice === undefined ? ({chests:'PICK A CHEST',targets:'HIT A BIRD',scratch:'SCRATCH A ZONE'}[type] || 'CHOOSE') : type === 'scratch' ? 'REVEAL THIS ZONE' : 'RETRY YOUR CHOICE';
    art.querySelectorAll<HTMLButtonElement>('.game-choice').forEach((b) => { b.disabled = busy || done || !loaded || !connected || (!!awardId && authoritativeAward?.status !== 'pending') || (choice !== undefined && Number(b.dataset.index) !== choice); });
  }
  function draw() {
    gsap.killTweensOf(art.querySelectorAll('*'));
    if (type === 'wheel') art.innerHTML = `<div class="wheel-aura"></div>${wheelArt(config)}`;
    else if (type === 'scratch') {
      art.innerHTML = `<div class="chest-heading">ONE ZONE. ONE REVEAL.</div><div class="scratch-grid">${config.prizes.map((_,i)=>`<button class="scratch-zone game-choice" data-index="${i}" aria-label="Scratch zone ${i+1}"><strong class="choice-prize">✦</strong><canvas width="240" height="150"></canvas><span>ZONE ${i+1}</span></button>`).join('')}</div>`;
    } else art.innerHTML = `<div class="chest-heading">ONE CHEST. YOUR TREASURE.</div><div class="chest-grid" style="--columns:${Math.min(4, config.prizes.length <= 4 ? 2 : 3 + Number(config.prizes.length > 9))}">${config.prizes.map((_,i)=>`<button class="chest-button game-choice" data-index="${i}" aria-label="Open chest ${i+1}">${chestArt(i)}<span>CHEST ${String(i+1).padStart(2,'0')}</span><strong class="chest-prize choice-prize"></strong></button>`).join('')}</div>`;
    summary.textContent = `${config.prizes.length} ${itemName} · ${config.prizes.some((p)=>p.mode) ? `Mixed zone prizes · Base ${config.baseAmount ?? '—'} credits` : config.mode === 'multiplier' ? `Multipliers × ${config.baseAmount} base credits` : 'Instant credit prizes'}${type === 'targets' && config.targetRange ? ` · ${config.targetRange.min}–${config.targetRange.max}` : ''}`;
    if (type === 'scratch') setupScratch();
    else art.querySelectorAll<HTMLButtonElement>('.game-choice').forEach((button) => button.addEventListener('click', () => { if (busy || done) return; choice = Number(button.dataset.index); void play(); }));
    update();
  }
  function setupScratch() {
    art.querySelectorAll<HTMLButtonElement>('.scratch-zone').forEach((zone) => {
      const canvas = zone.querySelector('canvas')!;
      const ctx = canvas.getContext('2d')!;
      const gradient = ctx.createLinearGradient(0,0,240,150); gradient.addColorStop(0,'#a7b9c0'); gradient.addColorStop(.5,'#526a79'); gradient.addColorStop(1,'#a7b9c0');
      ctx.fillStyle = gradient; ctx.fillRect(0,0,240,150); ctx.fillStyle = '#e8eff1'; ctx.font = 'bold 17px Arial'; ctx.textAlign = 'center'; ctx.fillText('SCRATCH HERE',120,80);
      const index = Number(zone.dataset.index);
      let pointer: number | null = null;
      let last: {x:number;y:number} | null = null;
      const scratch = (e: PointerEvent) => {
        if (busy || done || pointer !== e.pointerId || choice !== index) return;
        const r = canvas.getBoundingClientRect(); const x = (e.clientX-r.left)*240/r.width; const y = (e.clientY-r.top)*150/r.height;
        ctx.globalCompositeOperation = 'destination-out'; ctx.lineWidth = 32; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(last?.x ?? x,last?.y ?? y); ctx.lineTo(x,y); ctx.stroke(); ctx.beginPath(); ctx.arc(x,y,16,0,Math.PI*2); ctx.fill(); last = {x,y};
        const data = ctx.getImageData(0,0,240,150).data; let erased = 0;
        for (let i=3; i<data.length; i+=4) if (data[i] < 128) erased++;
        if (erased / (240*150) >= .3) { pointer = null; void play(); }
      };
      canvas.addEventListener('pointerdown',(e) => {
        if (zone.disabled || busy || done || (choice !== undefined && choice !== index)) return;
        choice = index; pointer = e.pointerId; last = null; canvas.setPointerCapture(e.pointerId); update(); scratch(e);
      });
      canvas.addEventListener('pointermove',scratch);
      canvas.addEventListener('pointerup',()=>{pointer=null;last=null;});
      canvas.addEventListener('pointercancel',()=>{pointer=null;last=null;});
      zone.addEventListener('click',(e)=>{ if (e.detail === 0 && !zone.disabled && !busy && !done) { choice=index; void play(); } });
    });
  }
  function finish(outcome: MiniOutcome) {
    done = true;
    const prize = config.prizes[outcome.prizeIndex];
    result.textContent = `${prize.label ? `${prize.label} · ` : ''}${outcome.mode === 'multiplier' ? `${outcome.amount} × ${config.baseAmount} = ` : ''}${outcome.payout} credits${awardId ? ' awarded!' : ' — preview result'}`;
    result.classList.add('has-prize');
  }
  function showOutcome(outcome: MiniOutcome, animate: boolean): Promise<void> {
    rotation?.kill(); rotation = null;
    if (type === 'wheel') {
      const rotor = art.querySelector<SVGGElement>('.wheel-rotor')!;
      const current = Number(gsap.getProperty(rotor,'rotation')) || 0;
      const angle = 360 - (outcome.prizeIndex + .5) * 360 / config.prizes.length;
      const target = Math.ceil(current / 360) * 360 + (animate ? 360 * 5 : 0) + angle;
      return new Promise((resolve) => { outcomeTween = gsap.to(rotor, { rotation: target, svgOrigin: '260 260', duration: animate && !reducedMotion ? 3.5 : 0, ease: 'power3.out', onComplete: () => { finish(outcome); resolve(); } }); });
    }
    const chosen = art.querySelector<HTMLButtonElement>(`.game-choice[data-index="${outcome.choiceIndex}"]`)!;
    gsap.killTweensOf(art.querySelectorAll('.bird-button'));
    // Legacy played awards have no saved layout: reconstruct the remaining pool deterministically.
    const remaining = config.prizes.map((_,i)=>i).filter((i)=>i !== outcome.prizeIndex);
    const layout = outcome.revealedPrizes ?? config.prizes.map((_,i)=>i === outcome.choiceIndex ? outcome.prizeIndex : remaining.shift()!);
    art.querySelectorAll<HTMLElement>('.game-choice').forEach((b,i) => {
      const selected = b === chosen;
      b.classList.add(selected ? 'chosen' : 'not-chosen');
      if (type !== 'targets' || selected) b.querySelector('.choice-prize')!.textContent = prizeLabel(config,selected ? outcome.amount : config.prizes[layout[i]].amount, selected ? outcome.mode : config.prizes[layout[i]].mode ?? config.mode);
      if (type === 'chests') {
        gsap.set(b.querySelector('.chest-lid'), { y: -37, rotation: -12, svgOrigin: '26 86', opacity: .65 });
        gsap.set(b.querySelector('.treasure'), { opacity: 1, y: -14 });
      }
      if (type === 'scratch') gsap.to(b.querySelector('canvas'), {opacity:0,duration:animate && !reducedMotion ? .4 : 0});
    });
    return new Promise((resolve) => { outcomeTween = gsap.fromTo(chosen,{scale:1},{scale:1.06,duration:animate && !reducedMotion ? .35 : 0,yoyo:true,repeat:1,onComplete:()=>{finish(outcome);resolve();}}); });
  }

  async function loadAward() {
    if (!socket || loading || busy || disposed) return;
    loading = true;
    try {
      const award = await socket.awardRequest('award.get', awardId!);
      if (disposed) return;
      if (award.type !== type) throw new Error('This award belongs to a different mini-game.');
      authoritativeAward = award; config = award.config; loaded = true; draw();
      if (award.status === 'played' && award.outcome) await showOutcome(award.outcome,false);
      else if (award.status !== 'pending') { loaded = false; result.textContent = 'This award has been revoked.'; }
      else result.textContent = instruction;
    } catch (e) { result.textContent = e instanceof Error ? e.message : 'Unable to load this award.'; }
    finally { loading = false; update(); }
  }
  async function play() {
    if (!loaded || busy || !connected || done) return;
    busy = true; result.classList.remove('has-prize'); result.textContent = 'Your prize is being selected…'; update();
    if (type === 'wheel' && !reducedMotion) rotation = gsap.to(art.querySelector('.wheel-rotor'), { rotation: '+=360', svgOrigin:'260 260', duration:1.2, repeat:-1, ease:'none' });
    try {
      let outcome: MiniOutcome;
      if (awardId) {
        const award = await socket!.awardRequest('award.play',awardId,choice);
        if (!award.outcome || !validOutcome(type,config,award.outcome)) throw new Error('The award result could not be verified. Retry to recover it.');
        authoritativeAward = award; outcome = award.outcome;
      } else outcome = await previewPlay(url,type,config,choice);
      if (disposed) return;
      await showOutcome(outcome,true);
    } catch (e) {
      rotation?.kill(); rotation = null;
      result.textContent = e instanceof Error ? e.message : 'Unable to play. Please retry.';
    } finally { busy = false; if (!disposed) update(); }
  }
  action.addEventListener('click', () => {
    if (done) {
      if (awardId) location.assign('/');
      else { done = false; choice = undefined; result.classList.remove('has-prize'); result.textContent = 'Your moment of luck awaits.'; draw(); }
    } else void play();
  });
  if (configError) { result.textContent = configError; art.innerHTML = '<div class="config-error">✦<p>Check your game parameters</p></div>'; update(); }
  else if (!awardId) draw();
  if (awardId) {
    socket = new GameSocket(url, (state) => { connected = state === 'connected'; update(); if (connected) void loadAward(); }, (player: Player) => {
      playerLabel.textContent = `${player.displayName} · ${player.balance.toLocaleString()} credits`;
      if (player.status === 'archived') { loaded = false; result.textContent = 'This player is archived.'; }
      update();
    }, (message) => { result.textContent = message; });
  }
  const dispose = () => { disposed = true; observer.disconnect(); rotation?.kill(); outcomeTween?.kill(); gsap.killTweensOf(art.querySelectorAll('*')); socket?.dispose(); };
  window.addEventListener('pagehide', dispose, { once: true });
  if (import.meta.hot) import.meta.hot.dispose(dispose);
}
