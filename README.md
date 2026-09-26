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
- `src/main.ts`: URL routing; `src/slot-app.ts`: slot controls and history.
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

## Lucky wheel and lucky chests

Open these routes on port 7777 (both work without parameters):

- `/lucky-wheel/` — default eight-sector wheel.
- `/lucky-chests/` — default six chests.
- `/lucky-wheel/?mode=multiplier&baseAmount=10&amounts=1,2,5,10`
- `/lucky-chests/?count=4&mode=instant&amounts=5,10,20,50`

Query parameters: `mode` is `instant` (default) or `multiplier`; `amounts` is a comma-separated list; `baseAmount` is required for multipliers. Optional `sectors` (wheel) or `count` (chests) must match the list length when both are supplied. Without amounts, the default prize list repeats to fill the requested count. Optional comma-separated `labels` match the amounts. Alternatively, URL-encode a `config` JSON object with `{mode, baseAmount?, prizes:[{amount,label?}]}`.

Wheel supports 2–16 sectors; chests supports 2–12 chests. Each prize entry has equal probability. Amounts and bases are integer mock credits; amounts may be zero. Each payout is limited to 1,000,000 credits. A chosen chest reveals one randomly selected prize from the configured pool.

Standalone URLs are replayable previews: results come from core-api over WebSocket and never change player balances. The fixed 5:3 stage scales uniformly; GSAP animates wheel deceleration and chest opening, respecting reduced motion.

Campaign/manual awards arrive in `awards.updated` and `session.ready`. The slot opens the next pending bonus after any current spin finishes. Award routes use `?awardId=<id>` and the existing player session. The server snapshots campaign configuration, ignores URL prize overrides, and credits each award exactly once. Refreshing or retrying restores the same settled prize. Continue returns to the slot and opens the next queued award.

## Moving targets and scratch cards

- `/shooting-targets/` — six fast-moving grumpy birds, a 30-second round, and a default per-hit reward range of 5–100 credits.
- `/shooting-targets/?duration=30&count=6&mode=multiplier&baseAmount=10&min=2&max=8` — a hit awards an integer multiplier from 2 through 8, inclusive.
- `/scratch-card/` — six scratchable zones; only one can be chosen.
- `/scratch-card/?amounts=25,3,50,5&modes=instant,multiplier,instant,multiplier&baseAmount=10` — mixed credit and multiplier zones.

Scratch supports 2–12 zones; targets maintains 3–12 live birds (legacy two-bird configurations are upgraded to three). Both support configurable choices and the same preview/award distinction as wheel and chests. Scratch cards accept optional per-zone `mode` in JSON `prizes`, or comma-separated `modes` in the URL. Any multiplier zone requires `baseAmount`.

Drag across a scratch zone to remove its coating. The first touch locks the choice; clearing 30% reveals the result. Keyboard activation and the Reveal this zone button provide an accessible alternative. Remaining zones reveal in gray and pay nothing. Lucky chests now also reveal all unpicked prizes in gray. The server stores the complete shuffled prize layout with the result, preserving it on reconnect/retry. Legacy settled chest awards without a layout reconstruct the remaining pool deterministically.

Grumpy birds move with GSAP (stationary when reduced motion is requested). Click/tap as many birds as possible before the countdown expires. Each shot bird grays out, falls, becomes unclickable, and is replaced immediately. At least three live targets stay visible. Instant rewards add together; multipliers add together and their sum multiplies the base amount once. Reward range is independent of which bird was hit. `min` and `max` define an inclusive uniform integer range; alternatively an explicit `amounts` list provides a discrete prize pool in URL previews. Campaign configuration is authoritative for awarded plays.

Targets accept `duration=5..120` seconds in preview URLs (default 30), or `durationSeconds` in JSON configuration and back-office forms. Press Start to begin. The HUD displays time remaining, hit count, and the accumulated amount/multiplier. The server controls the deadline and each unique target ID. Awarded rounds resume their existing timer after reconnecting; closing the browser does not pause it. A completed round pays the accumulated total exactly once, including zero-hit rounds. Preview rounds use a persistent WebSocket and restarting a disconnected preview creates a new mock round without wallet effects.
