import { Application, Assets, Container, Graphics, Sprite, Texture, Rectangle } from 'pixi.js';
import { gsap } from 'gsap';
import { SYMBOL_ATLAS_URL } from './symbols';
import { ReelMotion } from './reel-motion';
import type { Matrix, SpinResult } from '../network/game-socket';

const CELL = 132;
const WIDTH = 180;
const GAP = 14;
const COLORS = [0xc5afff, 0x8ee5d1, 0xffc886, 0x8bc9ff, 0xffaabd, 0xd7b7ff, 0xaff0aa, 0xffda87, 0xa0baff, 0xffafdc];
const INITIAL: Matrix = [[7, 2, 9], [3, 7, 1], [0, 4, 7]];

export class SlotScene {
  private app = new Application();
  private reels = [new ReelMotion(), new ReelMotion(), new ReelMotion()];
  private strips: { sprite: Sprite; plate: Graphics }[][] = [];
  private textures: Texture[] = [];
  private winTimeline: gsap.core.Timeline | null = null;
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private highlights = new Graphics();
  private lastMatrix: Matrix = INITIAL;
  private completion: (() => void) | null = null;
  private active = false;

  async init(host: HTMLElement) {
    await this.app.init({ width: 596, height: 424, backgroundAlpha: 0, antialias: true, resolution: Math.min(devicePixelRatio, 2), autoDensity: true });
    this.app.canvas.setAttribute('aria-hidden', 'true');
    this.app.canvas.style.width = '100%';
    this.app.canvas.style.height = '100%';
    const atlas = await Assets.load<Texture>(SYMBOL_ATLAS_URL);
    const cellWidth = atlas.width / 5;
    const cellHeight = atlas.height / 2;
    this.textures = Array.from({ length: 10 }, (_, index) => new Texture({
      source: atlas.source,
      frame: new Rectangle((index % 5) * cellWidth, Math.floor(index / 5) * cellHeight, cellWidth, cellHeight),
    }));
    host.appendChild(this.app.canvas);
    for (let reel = 0; reel < 3; reel++) {
      const x = 14 + reel * (WIDTH + GAP);
      const background = new Graphics().roundRect(x, 14, WIDTH, CELL * 3, 16).fill(0x171b28);
      this.app.stage.addChild(background);
      const container = new Container();
      container.position.set(x, 14);
      const mask = new Graphics().roundRect(x, 14, WIDTH, CELL * 3, 16).fill(0xffffff);
      this.app.stage.addChild(mask, container);
      container.mask = mask;
      const cells = [];
      for (let i = 0; i < 5; i++) {
        const plate = new Graphics();
        const sprite = new Sprite(this.textures[0]);
        sprite.anchor.set(0.5);
        sprite.x = WIDTH / 2;
        sprite.scale.set(118 / Math.max(this.textures[0].width, this.textures[0].height));
        container.addChild(plate, sprite);
        cells.push({ sprite, plate });
      }
      this.strips.push(cells);
      this.reels[reel].reset(INITIAL.map((row) => row[reel]));
    }
    this.app.stage.addChild(this.highlights);
    this.app.ticker.add((ticker) => {
      for (const reel of this.reels) reel.update(ticker.deltaMS);
      this.render();
      if (this.active && this.reels.every((reel) => reel.state === 'stopped')) {
        this.active = false;
        const complete = this.completion;
        this.completion = null;
        complete?.();
      }
    });
    this.render();
  }

  private render() {
    this.reels.forEach((reel, reelIndex) => {
      const base = Math.floor(reel.position);
      this.strips[reelIndex].forEach(({ sprite, plate }, offset) => {
        const index = base + offset - 1;
        const symbol = reel.symbolAt(index);
        const y = (index - reel.position) * CELL;
        sprite.texture = this.textures[symbol];
        sprite.y = y + CELL / 2;
        plate.clear().roundRect(12, y + 9, WIDTH - 24, CELL - 18, 12)
          .fill({ color: COLORS[symbol], alpha: 0.045 })
          .stroke({ color: COLORS[symbol], alpha: 0.10, width: 1 });
        plate.roundRect(27, y + 25, 4, 14, 2).fill({ color: COLORS[symbol], alpha: 0.4 });
      });
    });
  }

  start() {
    this.clearWinAnimation();
    this.active = true;
    this.reels.forEach((reel) => reel.start());
  }

  async settle(result: SpinResult) {
    await new Promise<void>((resolve) => {
      this.completion = resolve;
      this.reels.forEach((reel, i) => reel.stop(result.matrix.map((row) => row[i]), i * 280));
    });
    this.lastMatrix = result.matrix;
    const cells = new Set<string>();
    for (const win of result.wins) for (const position of win.positions) cells.add(`${position.reel},${position.row}`);
    if (cells.size && !this.reducedMotion) this.winTimeline = gsap.timeline({ repeat: -1, yoyo: true, defaults: { duration: 0.65, ease: 'sine.inOut' } });
    if (cells.size) {
      this.strips.forEach((strip, reel) => strip.forEach(({ sprite }, offset) => {
        if (offset >= 1 && offset <= 3 && !cells.has(`${reel},${offset - 1}`)) sprite.alpha = 0.48;
      }));
    }
    for (const key of cells) {
      const [reel, row] = key.split(',').map(Number);
      const sprite = this.strips[reel][row + 1].sprite;
      const baseScale = 118 / Math.max(sprite.texture.width, sprite.texture.height);
      if (this.winTimeline) {
        this.winTimeline.to(sprite.scale, { x: baseScale * 1.12, y: baseScale * 1.12 }, 0);
        this.winTimeline.fromTo(sprite, { alpha: 0.8 }, { alpha: 1 }, 0);
      }
      this.highlights.roundRect(14 + reel * (WIDTH + GAP) + 9, 14 + row * CELL + 6, WIDTH - 18, CELL - 12, 14)
        .fill({ color: 0xbbf6b1, alpha: 0.08 }).stroke({ color: 0xbbf6b1, alpha: 0.9, width: 2 });
    }
    if (this.winTimeline) this.winTimeline.fromTo(this.highlights, { alpha: 0.45 }, { alpha: 1 }, 0);
  }

  private clearWinAnimation() {
    this.winTimeline?.kill();
    this.winTimeline = null;
    this.highlights.clear();
    this.highlights.alpha = 1;
    for (const strip of this.strips) for (const { sprite } of strip) {
      sprite.alpha = 1;
      sprite.scale.set(118 / Math.max(sprite.texture.width, sprite.texture.height));
    }
  }

  cancel() {
    this.active = false;
    this.clearWinAnimation();
    this.reels.forEach((reel, i) => reel.reset(this.lastMatrix.map((row) => row[i])));
    this.completion?.();
    this.completion = null;
  }

  destroy() { this.cancel(); this.app.destroy(true, { children: true }); }
}
