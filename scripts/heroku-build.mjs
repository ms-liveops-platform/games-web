import { spawnSync } from 'node:child_process';
const required = {"VITE_GAME_WS_URL": ["wss:", "/ws/games"]};
for (const [name, [protocol, path]] of Object.entries(required)) {
  let url;
  try { url = new URL(process.env[name]); } catch { throw new Error(`Set ${name} in Heroku Config Vars before deploying.`); }
  if (url.protocol !== protocol || ['localhost', '127.0.0.1', '[::1]', '0.0.0.0'].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== (path || '/')) {
    throw new Error(`${name} must be a public ${protocol}// URL ending in ${path || '/'} (without query parameters or credentials).`);
  }
}
const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {stdio:'inherit'});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
