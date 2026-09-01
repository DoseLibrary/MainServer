/**
 * Dose service worker.
 *
 * Two jobs, deliberately no more:
 *  1. keep the app shell so an installed app opens without a connection;
 *  2. answer `/offline/<id>` from the downloaded file in OPFS, with proper
 *     range responses — Safari will not play a video served as a plain 200.
 *
 * Everything else falls through to the network. The offline UI is downloads
 * only, so there is no catalogue data to cache and nothing to go stale.
 */

const SHELL_CACHE = 'dose-shell-v1';
const SHELL_ASSETS = ['/', '/index.html', '/logo.svg', '/favicon.svg', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // A missing asset must not fail the install, or the app never goes offline.
    await Promise.allSettled(SHELL_ASSETS.map((asset) => cache.add(asset)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name !== SHELL_CACHE).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

/** Mirrors parseRangeHeader in src/lib/range.ts, which is where it is tested. */
function parseRange(header, size) {
  const whole = { start: 0, end: Math.max(0, size - 1), length: size, satisfiable: true };
  if (!header) return whole;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return whole;
  const [, rawStart, rawEnd] = match;
  if (rawStart === '' && rawEnd === '') return whole;
  let start;
  let end;
  if (rawStart === '') {
    const suffix = Number(rawEnd);
    if (suffix <= 0) return { start: 0, end: 0, length: 0, satisfiable: false };
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === '' ? size - 1 : Math.min(Number(rawEnd), size - 1);
  }
  if (start > end || start >= size) return { start: 0, end: 0, length: 0, satisfiable: false };
  return { start, end, length: end - start + 1, satisfiable: true };
}

async function downloadedFile(id) {
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle('downloads', { create: true });
  const handle = await dir.getFileHandle(`${id}.mp4`);
  return handle.getFile();
}

async function serveOffline(request, id) {
  let file;
  try { file = await downloadedFile(id); }
  catch { return new Response('Not downloaded', { status: 404 }); }

  const range = parseRange(request.headers.get('range'), file.size);
  if (!range.satisfiable) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${file.size}` } });
  }
  const body = file.slice(range.start, range.end + 1);
  const partial = Boolean(request.headers.get('range'));
  return new Response(body, {
    status: partial ? 206 : 200,
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': String(range.length),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
      ...(partial ? { 'Content-Range': `bytes ${range.start}-${range.end}/${file.size}` } : {}),
    },
  });
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/offline/')) {
    event.respondWith(serveOffline(event.request, url.pathname.slice('/offline/'.length)));
    return;
  }

  // Navigations fall back to the cached shell when the network is gone, so an
  // installed app still opens to its downloads.
  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      try { return await fetch(event.request); }
      catch { return (await caches.match('/index.html')) ?? Response.error(); }
    })());
    return;
  }

  if (SHELL_ASSETS.includes(url.pathname)) {
    event.respondWith((async () => {
      try { return await fetch(event.request); }
      catch {
        const cached = await caches.match(event.request);
        return cached ?? Response.error();
      }
    })());
  }
});
