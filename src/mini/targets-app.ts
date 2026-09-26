import { gsap } from 'gsap';
import { GameSocket } from '../network/game-socket';
import { birdArt } from './bird-art';
import { configFromUrl, defaultConfig, prizeLabel, validAward, type MiniAward, type MiniConfig, type TargetRound } from './config';
import './mini.css';

export function mountTargets() {
  const params = new URLSearchParams(location.search);
  const awardId = params.get('awardId');
  const root = document.querySelector<HTMLDivElement>('#app')!;
  let config: MiniConfig = defaultConfig('targets');
  let configError = '';
  if (!awardId) {
    try { config = configFromUrl('targets', params); }
    catch (error) { configError = error instanceof Error ? error.message : 'Invalid configuration.'; }
  }
  root.innerHTML = `<main class="bonus-stage"><div class="bonus-art"><div class="target-hud"><span>TIME <strong id="bird-time">—</strong></span><span>HITS <strong id="bird-hits">0</strong></span><span>TOTAL <strong id="bird-total">0</strong></span></div><div class="bird-field" id="bird-field"></div></div><section class="bonus-details"><p class="bonus-eyebrow">${awardId ? 'YOUR EXCLUSIVE BONUS' : 'TRY YOUR LUCK · PREVIEW'}</p><h1>Grumpy<br><em>Birds.</em></h1><p class="bonus-description">Hit the flock before time runs out.<br>Every bird adds to your total.</p><div class="prize-summary" id="bird-summary"></div><div class="mini-result" id="bird-result" role="status" aria-live="polite"></div><button class="mini-action" id="bird-action">START ROUND</button><p class="mini-player" id="bird-player">${awardId ? 'Connecting…' : 'Preview only · no balance changes'}</p><a class="back-link" href="/">← Back to slot</a></section></main>`;
  const field = root.querySelector<HTMLDivElement>('#bird-field')!;
  const action = root.querySelector<HTMLButtonElement>('#bird-action')!;
  const result = root.querySelector<HTMLElement>('#bird-result')!;
  const time = root.querySelector<HTMLElement>('#bird-time')!;
  const hits = root.querySelector<HTMLElement>('#bird-hits')!;
  const total = root.querySelector<HTMLElement>('#bird-total')!;
  const summary = root.querySelector<HTMLElement>('#bird-summary')!;
  const playerLabel = root.querySelector<HTMLElement>('#bird-player')!;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const url = import.meta.env.VITE_GAME_WS_URL || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:5555/ws/games`;
  let gameSocket: GameSocket | null = null;
  let previewSocket: WebSocket | null = null;
  let connected = !awardId;
  let loaded = !awardId && !configError;
  let round: TargetRound | undefined;
  let deadline = 0;
  let finished = false;
  let processing = false;
  let disposed = false;
  let failed = false;
  const queue: string[] = [];
  const birds = new Map<string, HTMLButtonElement>();
  let serial = 0;
  let previewPending: {reject:(error:Error)=>void} | undefined;
  const resize = () => root.style.setProperty('--bonus-scale', String(Math.min(root.clientWidth / 1000, root.clientHeight / 600)));
  const observer = new ResizeObserver(resize); observer.observe(root); resize();

  function nextId(id: string) {
    const parts = id.split('.'); return `${parts[0]}.${parts[1]}.${Number(parts[2])+1}`;
  }
  function remaining() { return finished ? 0 : round ? Math.max(0, deadline - performance.now()) : (config.durationSeconds ?? 30)*1000; }
  function update() {
    time.textContent = `${(remaining()/1000).toFixed(1)}s`;
    hits.textContent = String(round?.hits.length ?? 0);
    total.textContent = prizeLabel(config, round?.amount ?? 0);
    summary.textContent = `${config.durationSeconds ?? 30} seconds · ${Math.max(3,config.prizes.length)} live birds · ${config.targetRange ? `${config.targetRange.min}–${config.targetRange.max}` : 'Custom'} ${config.mode === 'multiplier' ? `multipliers × ${config.baseAmount} base credits` : 'credits per hit'}`;
    action.disabled = (!loaded && !failed) || !connected || processing || (!!round && !finished && !failed);
    action.textContent = finished ? (awardId ? 'CONTINUE TO SLOT' : 'PLAY AGAIN') : failed ? 'RECONNECT / RECOVER' : round ? 'ROUND IN PROGRESS' : 'START ROUND';
    for (const bird of birds.values()) bird.disabled = !connected || finished || remaining() <= 0 || failed;
  }
  function clearBirds() {
    gsap.killTweensOf(field.querySelectorAll('*')); birds.clear(); field.replaceChildren();
  }
  function fly(bird: HTMLButtonElement) {
    if (disposed || !bird.isConnected || bird.classList.contains('shot-bird') || finished || remaining() <= 0) return;
    const x = Math.random()*450, y = 20+Math.random()*300;
    const distance = Math.hypot(x-Number(gsap.getProperty(bird,'x')),y-Number(gsap.getProperty(bird,'y')));
    gsap.to(bird, {x,y,duration:Math.max(.28,distance/420),ease:'none',onComplete:()=>fly(bird)});
  }
  function spawn(id: string) {
    if (birds.has(id) || finished || remaining() <= 0) return;
    const bird = document.createElement('button');
    bird.className = 'bird-button timed-bird'; bird.dataset.targetId = id;
    bird.setAttribute('aria-label',`Shoot bird ${++serial}`);
    bird.innerHTML = `${birdArt(serial)}<strong class="choice-prize"></strong>`;
    field.append(bird); birds.set(id,bird);
    gsap.set(bird,{x:Math.random()*450,y:20+Math.random()*300});
    if (!reduced) fly(bird);
    bird.addEventListener('click',()=>{
      if (bird.disabled || !round || finished || !connected || remaining() <= 0 || !birds.has(id)) return;
      bird.disabled = true; birds.delete(id); bird.classList.add('shot-bird');
      gsap.killTweensOf(bird);
      // Replace immediately; hits are submitted in order and each ID can pay only once.
      spawn(nextId(id));
      gsap.to(bird,{y:470,rotation:110,opacity:0,duration:reduced ? 0 : .65,ease:'power2.in',onComplete:()=>bird.remove()});
      queue.push(id); void drain(); update();
    });
  }
  function synchronizeBirds() {
    if (!round) return;
    for (const [id,bird] of birds) if (!round.activeIds.includes(id)) {gsap.killTweensOf(bird);bird.remove();birds.delete(id);}
    if (!finished) round.activeIds.forEach(spawn);
  }
  function accept(award: MiniAward) {
    config = award.config; round = award.targetRound;
    deadline = performance.now() + Math.max(0,(round?.endsAt ?? 0)-(award.serverNow ?? Date.now()));
    if (award.status === 'revoked') { loaded=false;result.textContent='This award has been revoked.';clearBirds(); }
    else if (award.status === 'played') {
      finished=true;queue.length=0;
      gsap.killTweensOf(field.querySelectorAll('.bird-button'));
      field.querySelectorAll('button').forEach((bird)=>{bird.disabled=true;bird.classList.add('not-chosen');});
      const outcome=award.outcome!;
      result.textContent=`Time’s up! ${outcome.hitCount ?? 1} hits · ${outcome.mode === 'multiplier' ? `${outcome.amount} × ${config.baseAmount} = ` : ''}${outcome.payout} credits${awardId ? ' awarded!' : ' — preview result'}`;
      result.classList.add('has-prize');
    } else if (round) result.textContent=`Keep shooting! ${round.payout} credits earned so far.`;
    else result.textContent='Ready? The countdown starts when you press Start.';
    if (!queue.length) synchronizeBirds();
    update();
  }
  async function preview(actionName: 'start'|'hit'|'finish',targetId?:string): Promise<MiniAward> {
    if (!previewSocket || previewSocket.readyState !== WebSocket.OPEN) {
      const socket = new WebSocket(url); previewSocket=socket;
      await new Promise<void>((resolve,reject)=>{
        const timer=setTimeout(()=>{socket.close();reject(new Error('Connection timed out.'));},8000);
        socket.onopen=()=>{clearTimeout(timer);resolve();};
        socket.onerror=()=>{clearTimeout(timer);reject(new Error('Cannot connect to core-api.'));};
      });
      socket.onclose=()=>{if(previewSocket===socket)previewPending?.reject(new Error('Preview disconnected. Start a new preview round.'));};
    }
    return new Promise((resolve,reject)=>{
      const requestId=crypto.randomUUID(); const socket=previewSocket!;
      const timer=setTimeout(()=>finish(new Error('Request timed out.')),8000);
      function finish(error?:Error,award?:MiniAward) {clearTimeout(timer);socket.onmessage=null;previewPending=undefined;error?reject(error):resolve(award!);}
      previewPending={reject:(e)=>finish(e)};
      socket.onmessage=(event)=>{
        try {const m=JSON.parse(event.data);if(m.requestId!==requestId)return;
          if(m.type!=='targets.result'||!validAward(m.award))finish(new Error(m.error?.message||'Invalid target result.'));
          else finish(undefined,m.award);
        } catch {finish(new Error('Invalid response.'));}
      };
      socket.send(JSON.stringify({type:'targets.preview',requestId,action:actionName,...(actionName==='start'?{config}:{}),...(targetId?{targetId}:{})}));
    });
  }
  const request = (name:'start'|'hit'|'finish',targetId?:string) => awardId
    ? gameSocket!.awardRequest(`targets.${name}`,awardId,undefined,targetId)
    : preview(name,targetId);
  async function drain() {
    if (processing || !connected || disposed || failed) return;
    processing=true;
    try {
      while(queue.length && !finished) {
        const id=queue[0]; const award=await request('hit',id);
        if(disposed)return; queue.shift();accept(award);
      }
      if(round && remaining()<=0 && !finished) accept(await request('finish'));
    } catch(error) {failed=true;result.textContent=error instanceof Error?error.message:'Unable to save the hit. Recover to reload the round.';}
    finally {processing=false;update();}
  }
  async function load() {
    if(processing || disposed)return;
    processing=true;
    try {const award=await gameSocket!.awardRequest('award.get',awardId!); if(disposed)return;
      if(award.type!=='targets')throw new Error('This award belongs to another game.');
      queue.length=0;failed=false;loaded=true;clearBirds();accept(award);
    } catch(error) {failed=true;result.textContent=error instanceof Error?error.message:'Unable to load award.';}
    finally{processing=false;update();}
  }
  action.addEventListener('click',async()=>{
    if(finished && awardId){location.assign('/');return;}
    if(failed && awardId){await load();return;}
    processing=true;failed=false;finished=false;queue.length=0;round=undefined;clearBirds();result.classList.remove('has-prize');update();
    try {
      if(!awardId){previewSocket?.close();previewSocket=null;}
      accept(await request('start'));
    } catch(error){failed=true;result.textContent=error instanceof Error?error.message:'Unable to start.';}
    finally{processing=false;update();}
  });
  const ticker=setInterval(()=>{
    if(disposed)return;
    if(round && remaining()<=0 && !finished){gsap.killTweensOf(field.querySelectorAll('.bird-button'));void drain();}
    update();
  },100);
  if(configError){loaded=false;result.textContent=configError;}
  else result.textContent='Ready? The countdown starts when you press Start.';
  if(awardId) gameSocket=new GameSocket(url,(state)=>{
    connected=state==='connected';update();if(connected)void load();
  },(player)=>{playerLabel.textContent=`${player.displayName} · ${player.balance.toLocaleString()} credits`;},(message)=>{result.textContent=message;});
  update();
  const dispose=()=>{disposed=true;clearInterval(ticker);observer.disconnect();clearBirds();gameSocket?.dispose();previewPending?.reject(new Error('Game closed.'));previewSocket?.close();};
  window.addEventListener('pagehide',dispose,{once:true});
  if(import.meta.hot)import.meta.hot.dispose(dispose);
}
