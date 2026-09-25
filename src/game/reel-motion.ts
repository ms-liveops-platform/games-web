/** Pure animation state, measured in symbol cells and milliseconds. */
export class ReelMotion {
  position = 0;
  state: 'idle' | 'spinning' | 'stopping' | 'stopped' = 'idle';
  private pending: { symbols: number[]; delay: number } | null = null;
  private landing: { start: number; end: number; elapsed: number; symbols: number[] } | null = null;
  private settled = [0, 1, 2];
  // Decreasing strip position moves visible symbols down: y = index - position.
  private readonly speed = 0.018;
  private readonly duration = 850;

  start() {
    this.position = 0;
    this.pending = null;
    this.landing = null;
    this.state = 'spinning';
  }

  stop(symbols: number[], delay = 0) {
    if (this.state !== 'spinning' || this.pending) return;
    this.pending = { symbols: [...symbols], delay };
  }

  reset(symbols: number[]) {
    this.settled = [...symbols];
    this.position = 0;
    this.pending = null;
    this.landing = null;
    this.state = 'idle';
  }

  update(ms: number) {
    if (this.state === 'spinning') {
      if (!this.pending) { this.position -= ms * this.speed; return; }
      const waiting = Math.min(ms, this.pending.delay);
      this.position -= waiting * this.speed;
      this.pending.delay -= waiting;
      ms -= waiting;
      if (this.pending.delay > 0) return;
      this.landing = {
        start: this.position,
        end: Math.floor(this.position - this.speed * this.duration / 3),
        elapsed: 0,
        symbols: this.pending.symbols,
      };
      this.pending = null;
      this.state = 'stopping';
    }
    if (this.state === 'stopping' && this.landing) {
      const landing = this.landing;
      landing.elapsed = Math.min(landing.elapsed + ms, this.duration);
      const t = landing.elapsed / this.duration;
      this.position = landing.start + (landing.end - landing.start) * (1 - (1 - t) ** 3);
      if (t === 1) {
        this.position = landing.end;
        this.settled = landing.symbols;
        this.state = 'stopped';
      }
    }
  }

  symbolAt(index: number): number {
    if (this.state === 'idle') return this.settled[((index % 3) + 3) % 3];
    if (this.landing && index >= this.landing.end && index < this.landing.end + 3) {
      return this.landing.symbols[index - this.landing.end];
    }
    // Decorative symbols only; the server supplies every landed symbol.
    return ((index * 7 + 3) % 10 + 10) % 10;
  }
}
