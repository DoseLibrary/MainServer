/**
 * Client side of the `/api/v1/events` push channel.
 *
 * The server only ever says "the catalog changed"; the client refetches through
 * its own authenticated requests. Reconnects with backoff while the page is
 * open, and stays silent in environments without WebSocket support.
 */
export function subscribeCatalogUpdates(onUpdate: () => void): () => void {
  if (typeof WebSocket === 'undefined') return () => {};

  let socket: WebSocket | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let retryDelay = 2_000;
  let closed = false;

  const connect = () => {
    if (closed) return;
    const url = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/api/v1/events`;
    try { socket = new WebSocket(url); } catch { return; }
    socket.onopen = () => { retryDelay = 2_000; };
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(String(event.data)) as { type?: string };
        if (message.type === 'catalog.updated') onUpdate();
      } catch { /* unknown frames are noise */ }
    };
    socket.onclose = () => {
      if (closed) return;
      retryTimer = setTimeout(connect, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 60_000);
    };
  };

  connect();
  return () => {
    closed = true;
    clearTimeout(retryTimer);
    try { socket?.close(1000); } catch { /* already gone */ }
  };
}
