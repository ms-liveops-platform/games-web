# Deploy games-web to Heroku

This repository is prepared as a standalone Heroku Cedar app on `heroku-24` using the `heroku/nodejs` classic buildpack, Node 24 and npm 11. The API and the other frontend are deployed as separate apps.

1. Create a globally unique app from this repository:

   ```sh
   heroku create YOUR-APP-NAME --generation cedar --stack heroku-24 --buildpack heroku/nodejs
   ```

2. In the app's Settings → Config Vars, set these **before deploying**:

- `NODE_ENV=production`
- `HOST=0.0.0.0`
- `VITE_GAME_WS_URL=wss://YOUR-ACTUAL-API-HOST/ws/games`

Use the actual Web URLs from the API/games app dashboards (their hostnames may include generated suffixes). Do not set `PORT`. Never put the MongoDB connection string in a frontend config var.

3. Review and commit the prepared files, then deploy:

   ```sh
   git push heroku HEAD:main
   heroku ps:scale web=1
   heroku logs --tail
   ```

Select the dyno plan in Heroku. The `app.json` manifest describes the configuration for app-creation workflows; CLI Git deployments still need the Config Vars set explicitly.

Heroku runs `heroku-postbuild`, which validates the public deployment URLs and runs the TypeScript/Vite build. `npm start` serves `dist` using Express on Heroku's assigned `$PORT`. Dev dependencies are needed during build and can be pruned afterward. `games-web` does not use a Vite development server in deployment.

Direct routes `/lucky-wheel/`, `/lucky-chests/`, `/shooting-targets/`, and `/scratch-card/` support refresh through the SPA fallback.

`VITE_*` values are public and embedded at build time: changing them requires rebuilding/redeploying, not just restarting. Use HTTPS for browser HTTP requests and WSS for WebSockets. `/healthz` is the read-only frontend health endpoint.

For local production-server verification:

```sh
npm run build
npm run test:server
```

`npm run dev` retains its existing local port. The full three-app walkthrough is in the core-api repository's `HEROKU.md`.

References: [Heroku Node builds](https://devcenter.heroku.com/articles/nodejs-classic-buildpack-builds), [Vite environment variables](https://vite.dev/guide/env-and-mode.html).
