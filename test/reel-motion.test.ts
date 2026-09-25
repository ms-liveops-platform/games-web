import { describe, expect, it } from 'vitest';
import { ReelMotion } from '../src/game/reel-motion';

describe('reel choreography', () => {
  it('keeps rotating until a server result is supplied', () => {
    const reel = new ReelMotion();
    reel.start();
    reel.update(8000);
    expect(reel.state).toBe('spinning');
    expect(reel.position).toBeLessThan(0);
  });
  it('stops left to right and lands on the exact server columns', () => {
    const reels = [new ReelMotion(), new ReelMotion(), new ReelMotion()];
    const columns = [[0, 9, 1], [8, 0, 3], [2, 5, 7]];
    reels.forEach((reel, i) => { reel.start(); reel.update(123); reel.stop(columns[i], i * 280); });
    reels.forEach((reel) => reel.update(850));
    expect(reels.map((r) => r.state)).toEqual(['stopped', 'stopping', 'stopping']);
    reels.forEach((reel) => reel.update(280));
    expect(reels.map((r) => r.state)).toEqual(['stopped', 'stopped', 'stopping']);
    reels.forEach((reel) => reel.update(280));
    expect(reels.map((r) => r.state)).toEqual(['stopped', 'stopped', 'stopped']);
    reels.forEach((reel, i) => expect([0, 1, 2].map((row) => reel.symbolAt(reel.position + row))).toEqual(columns[i]));
  });
  it('can cancel a spin and start another without retaining the failed result', () => {
    const reel = new ReelMotion();
    reel.start(); reel.stop([9, 9, 9]); reel.update(100);
    reel.reset([1, 2, 3]);
    expect([0, 1, 2].map((i) => reel.symbolAt(i))).toEqual([1, 2, 3]);
    reel.start(); reel.stop([4, 5, 6]); reel.update(2000);
    expect([0, 1, 2].map((i) => reel.symbolAt(reel.position + i))).toEqual([4, 5, 6]);
  });
});
