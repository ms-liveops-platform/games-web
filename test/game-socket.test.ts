import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GameSocket, isSpinResult } from '../src/network/game-socket';

class FakeSocket {
  static OPEN = 1;
  static instances: FakeSocket[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  sent: string[] = [];
  constructor(public url: string) { FakeSocket.instances.push(this); }
  send(value: string) { this.sent.push(value); }
  open() { this.readyState = 1; this.onopen?.(); }
  close() { this.readyState = 3; this.onclose?.(); }
  message(value: unknown) { this.onmessage?.({ data: JSON.stringify(value) }); }
}
const result = { spinId: 'server-spin', matrix: [[1, 2, 3], [4, 5, 6], [7, 8, 9]], wins: [], winCount: 0 };
let client: GameSocket;
beforeEach(() => { vi.useFakeTimers(); FakeSocket.instances = []; vi.stubGlobal('WebSocket', FakeSocket); });
afterEach(() => { client?.dispose(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it('sends only the WebSocket spin command and matches the response ID', async () => {
  client = new GameSocket('ws://localhost/ws/games', vi.fn());
  const socket = FakeSocket.instances[0]; socket.open();
  const pending = client.spin();
  const request = JSON.parse(socket.sent[0]);
  expect(request.type).toBe('slot.spin');
  expect(request.requestId).toBeTypeOf('string');
  const resolved = vi.fn(); pending.then(resolved);
  socket.message({ type: 'slot.result', requestId: 'other', result });
  await Promise.resolve(); expect(resolved).not.toHaveBeenCalled();
  socket.message({ type: 'slot.result', requestId: request.requestId, result });
  await expect(pending).resolves.toEqual(result);
});

it('blocks concurrent spins and times out without resending', async () => {
  client = new GameSocket('ws://localhost/ws/games', vi.fn());
  const socket = FakeSocket.instances[0]; socket.open();
  const pending = client.spin();
  const failed = expect(pending).rejects.toThrow('timed out');
  await expect(client.spin()).rejects.toThrow('already in progress');
  vi.advanceTimersByTime(8000); await failed;
  expect(socket.sent).toHaveLength(1);
});

it('rejects a disconnected spin and reconnects without replaying it', async () => {
  client = new GameSocket('ws://localhost/ws/games', vi.fn());
  const socket = FakeSocket.instances[0]; socket.open();
  const failed = expect(client.spin()).rejects.toThrow('Connection lost');
  socket.close(); await failed;
  vi.advanceTimersByTime(2000);
  expect(FakeSocket.instances).toHaveLength(2);
  expect(FakeSocket.instances[1].sent).toHaveLength(0);
});

it('handles server errors and malformed results', async () => {
  client = new GameSocket('ws://localhost/ws/games', vi.fn());
  const socket = FakeSocket.instances[0]; socket.open();
  let pending = client.spin();
  socket.message({ type: 'error', requestId: JSON.parse(socket.sent[0]).requestId, error: { message: 'Try later' } });
  await expect(pending).rejects.toThrow('Try later');
  pending = client.spin();
  socket.message({ type: 'slot.result', requestId: JSON.parse(socket.sent[1]).requestId, result: { ...result, matrix: [[99]] } });
  await expect(pending).rejects.toThrow('invalid spin result');
});

it('validates winning cell coordinates against the matrix', () => {
  expect(isSpinResult(result)).toBe(true);
  expect(isSpinResult({ ...result, winCount: 1 })).toBe(false);
  expect(isSpinResult({ ...result, matrix: [[1, 2, 30], [1, 2, 3], [1, 2, 3]] })).toBe(false);
  expect(isSpinResult({ ...result, wins: [{ id: 0, positions: [null] }], winCount: 1 })).toBe(false);
});
