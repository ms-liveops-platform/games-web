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

`matrix[row][reel]` matches the core-api protocol. Decorative moving symbols do not determine the result. The server controls every landed symbol and win. Each spin costs 1 mock credit. IDs 0–2 pay 1× per winning way, 3–5 pay 3×, and 6–9 pay 10×. The server deducts the bet and credits the total payout atomically. The game displays the persisted player display name and balance. There are no real-money transactions.

A failed request or 8-second timeout cancels animation and restores the last completed board. Connections retry every 2 seconds. Session credentials and unresolved spin IDs are stored locally. A manual retry after a timeout reuses the original request ID, and the backend returns the same saved result without another charge. Session history lives only in the page; rounds and balances persist in MongoDB.

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

## Layout and history

The screen contains the player name/balance, reels, spin button, and history. The entire 1000 × 600 composition scales uniformly to fit the viewport, preserving its 5:3 aspect ratio and side-by-side arrangement; unused space surrounds it when the window has another aspect ratio. History scrolls inside its panel and retains the latest 50 completed spins. Winning entries show the matching symbol triplets, grouped by symbol with their winning-way count.

## Player sessions

core-api requires MongoDB configuration before play. On connection the client sends `session.open`, restoring its stored player ID and token. Without credentials, core-api provisions a demo player with 100 credits. Use the back-office player launch link to play as a specific player. Link credentials are consumed from the fragment and removed from the address bar.

All profile and balance communication remains WebSocket-only. `player.updated` messages reflect mock deposits, credit awards, profile changes, and spins. Back-office requests use HTTP independently. The backend is authoritative for bet, payout, and current balance.
