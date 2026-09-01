/**
 * Client side of the `/api/v1/events` push channel.
 *
 * The server only ever says what changed, never what the change contains; the
 * client refetches through its own authenticated requests. Reconnects with
 * backoff while the page is open, and stays silent in environments without
 * WebSocket support.
 *
 * One socket is shared by every subscriber on the page: screens mount and
 * unmount constantly, and a connection per screen would be a connection storm.
 */
export type RealtimeMessage =
  | { type: 'catalog.updated'; reason?: string }
  | { type: 'plugin.updated'; pluginId: string; status: 'running' | 'succeeded' | 'failed' };

type Listener = (message: RealtimeMessage) => void;

const listeners = new Set<Listener>();
let socket: WebSocket | undefined;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let retryDelay = 2_000;

function connect() {
  if (typeof WebSocket === 'undefined' || socket || listeners.size === 0) return;
  const url = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/api/v1/events`;
  let opened: WebSocket;
  try { opened = new WebSocket(url); } catch { return; }
  socket = opened;
  opened.onopen = () => { retryDelay = 2_000; };
  opened.onmessage = (event) => {
    let message: RealtimeMessage;
    try { message = JSON.parse(String(event.data)) as RealtimeMessage; }
    catch { return; /* unknown frames are noise */ }
    if (!message?.type) return;
    for (const listener of [...listeners]) listener(message);
  };
  opened.onclose = () => {
    socket = undefined;
    if (listeners.size === 0) return;
    retryTimer = setTimeout(connect, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 60_000);
  };
}

/** Every push, until the returned function is called. */
export function subscribeRealtime(onMessage: Listener): () => void {
  listeners.add(onMessage);
  connect();
  return () => {
    listeners.delete(onMessage);
    if (listeners.size > 0) return;
    clearTimeout(retryTimer);
    const open = socket;
    socket = undefined;
    try { open?.close(1000); } catch { /* already gone */ }
  };
}

/** Catalog changes only: new titles, removals, availability. */
export function subscribeCatalogUpdates(onUpdate: () => void): () => void {
  return subscribeRealtime((message) => { if (message.type === 'catalog.updated') onUpdate(); });
}

/** Plugin run starts and outcomes, whoever triggered them. */
export function subscribePluginUpdates(onUpdate: (pluginId: string) => void): () => void {
  return subscribeRealtime((message) => { if (message.type === 'plugin.updated') onUpdate(message.pluginId); });
}
