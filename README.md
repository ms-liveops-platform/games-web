# Orbit Numbers / games-web

A responsive 3 × 3 slot frontend built with PixiJS v8, TypeScript, and Vite. All game communication with core-api uses the browser's native WebSocket API. No HTTP API calls, polling, or Socket.IO are used.

## Run locally

Requires Node.js 20.19+ or 22.12+.

Start core-api in one terminal:

```sh
cd ../core-api
npm install
npm run dev
```

From games-web in a second terminal:

```sh
npm install
npm run dev
```

Open http://127.0.0.1:7777. Vite hot module replacement is enabled. The server fails if port 7777 is occupied instead of choosing another port.

The default game connection is `ws://<current hostname>:5555/ws/games` (or `wss` on HTTPS). To override it, copy `.env.example` to `.env` and set `VITE_GAME_WS_URL`, then restart Vite. For remote access, configure core-api's bind address appropriately. Static frontend assets are served over HTTP; game requests and results go exclusively over WebSocket.

## Spin flow

1. The button is enabled once PixiJS is ready and the WebSocket is connected.
2. Clicking starts all three reels immediately and sends `{ "type": "slot.spin", "requestId": "<uuid>" }`.
3. The frontend accepts only a matching `slot.result` with a valid 3 × 3 numeric matrix and winning positions.
4. The left reel starts decelerating when the response arrives. The middle and right follow at 280 ms intervals. Each deceleration takes 850 ms and lands precisely on its server-provided column.
5. All reels must settle before another spin can begin. Winning cells are outlined; the winning-way count and recent session results update.

`matrix[row][reel]` matches the core-api protocol. Decorative moving symbols do not determine the result. The server controls every landed symbol and win. There are no bets, balances, payouts, or real-money transactions.

A failed request or 8-second timeout cancels animation and restores the last completed board. Connections retry every 2 seconds. Spins are never automatically replayed: the current stateless backend cannot recover or deduplicate them. Session history lives only in the page.

## Structure

- `src/game/reel-motion.ts`: deterministic reel motion and landing state.
- `src/game/slot-scene.ts`: PixiJS scene, numeric symbols, masks, and win highlights.
- `src/network/game-socket.ts`: WebSocket lifecycle, request correlation, validation, and timeout handling.
- `src/main.ts`: controls, status, and session history.
- `src/style.css`: responsive page layout.

## Verify

```sh
npm test
npm run build
npm run preview
```

Tests cover continuous rotation while waiting, sequential stops, exact symbols, cancellation, request correlation, concurrent-spin prevention, timeouts, disconnection, reconnection, and response validation.

## Symbol artwork and win animation

The generated transparent atlas in `public/assets/symbols.png` contains ten symbols in a 5 × 2 grid. IDs 0–9 map to cherries, lemon, grapes, bell, star, diamond, clover, crown, horseshoe, and planet. The server protocol and win evaluation remain unchanged.

PixiJS renders each atlas frame as a sprite. GSAP gently pulses winning sprites (scale and opacity) and their outlines while other symbols dim. The timeline is killed and visual state reset on the next spin, cancellation, or scene destruction. Reduced-motion preferences use static highlights.
