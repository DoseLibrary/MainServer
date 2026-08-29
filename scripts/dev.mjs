/* global Bun */
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const state = resolve(root, '.dose');
await mkdir(resolve(state, 'config'), { recursive: true });
await mkdir(resolve(state, 'transcode'), { recursive: true });

// Load .env.local / .env explicitly so it works regardless of runtime autoload behaviour.
async function loadEnvFile(name) {
  try {
    const contents = await readFile(resolve(root, name), 'utf8');
    const values = {};
    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      values[key] = value;
    }
    return values;
  } catch {
    return {};
  }
}

const fileEnv = { ...(await loadEnvFile('.env')), ...(await loadEnvFile('.env.local')) };
// Precedence: real shell env wins over files; dev overrides below win over both.
const environment = { ...fileEnv, ...process.env, NODE_ENV: 'development', DATABASE_URL: `pglite://${resolve(state, 'database')}`, CONFIG_PATH: resolve(state, 'config'), TRANSCODE_PATH: resolve(state, 'transcode'), PORT: process.env.DOSE_DEV_API_PORT ?? '3000' };
if (!environment.TMDB_API_TOKEN) console.warn('\nMetadata warning: TMDB_API_TOKEN is not configured. Scans will not include posters, backdrops, or overviews. Add it to .env.local and restart.');

const migration = Bun.spawn(['bun', 'src/server/migrate.ts'], { cwd: root, env: environment, stdout: 'inherit', stderr: 'inherit' });
if (await migration.exited !== 0) process.exit(1);
const seed = Bun.spawn(['bun', 'src/server/seed-dev.ts'], { cwd: root, env: environment, stdout: 'inherit', stderr: 'inherit' });
if (await seed.exited !== 0) process.exit(1);
const children = [
  Bun.spawn(['bun', '--watch', 'src/server/index.ts'], { cwd: root, env: environment, stdout: 'inherit', stderr: 'inherit' }),
  Bun.spawn(['bun', 'vite', '--host', '127.0.0.1'], { cwd: root, env: environment, stdout: 'inherit', stderr: 'inherit' }),
];
console.log(`\nDose development is starting: UI http://localhost:5173 · API http://localhost:${environment.PORT} · login ${environment.DOSE_DEV_USERNAME ?? 'admin'}/${environment.DOSE_DEV_PASSWORD ?? 'admin'}`);
const stop = () => { for (const child of children) child.kill(); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
await Promise.race(children.map((child) => child.exited)); stop();
