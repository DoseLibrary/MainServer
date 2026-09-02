import { useEffect, useRef } from 'react';
import type { MovieNightMessage } from './api';

const KEY_PREFIX = 'dose.movieNight.';
const normalize = (code: string) => code.trim().toUpperCase();

export interface StoredParticipant { participantId: string; token: string }

export function loadParticipant(code: string): StoredParticipant | undefined {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + normalize(code));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<StoredParticipant>;
    return parsed.participantId && parsed.token ? { participantId: parsed.participantId, token: parsed.token } : undefined;
  } catch { return undefined; }
}
export function saveParticipant(code: string, value: StoredParticipant): void {
  try { localStorage.setItem(KEY_PREFIX + normalize(code), JSON.stringify(value)); } catch { /* private mode */ }
}
export function clearParticipant(code: string): void {
  try { localStorage.removeItem(KEY_PREFIX + normalize(code)); } catch { /* ignore */ }
}

export function socketUrl(code: string, token?: string): string {
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const query = token ? `?token=${encodeURIComponent(token)}` : '';
  return `${scheme}://${window.location.host}/api/v1/movie-night/${encodeURIComponent(normalize(code))}/socket${query}`;
}

/** Close codes after which reconnecting is pointless: the night is over or we are not welcome. */
const TERMINAL_CLOSE = new Set([4000, 4401, 4404]);

/**
 * One socket for the movie night this screen is on. Reconnects with backoff on
 * network drops; the caller resyncs by refetching state on every `onOpen`.
 */
export function useMovieNightSocket(
  code: string | undefined,
  token: string | undefined,
  onMessage: (message: MovieNightMessage) => void,
  onClose?: (closeCode: number) => void,
  onOpen?: () => void,
): void {
  const handlers = useRef({ onMessage, onClose, onOpen });
  useEffect(() => { handlers.current = { onMessage, onClose, onOpen }; });

  useEffect(() => {
    if (!code || typeof WebSocket === 'undefined') return;
    let socket: WebSocket | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let delay = 1_000;
    let stopped = false;

    const connect = () => {
      if (stopped) return;
      let next: WebSocket;
      try { next = new WebSocket(socketUrl(code, token)); } catch { return; }
      socket = next;
      next.onopen = () => { delay = 1_000; handlers.current.onOpen?.(); };
      next.onmessage = (event) => {
        let message: MovieNightMessage;
        try { message = JSON.parse(String(event.data)) as MovieNightMessage; } catch { return; }
        if (message?.type) handlers.current.onMessage(message);
      };
      next.onclose = (event) => {
        socket = undefined;
        if (stopped) return;
        if (TERMINAL_CLOSE.has(event.code)) { handlers.current.onClose?.(event.code); return; }
        timer = setTimeout(connect, delay);
        delay = Math.min(delay * 2, 30_000);
      };
    };
    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      try { socket?.close(1000); } catch { /* gone */ }
    };
  }, [code, token]);
}
