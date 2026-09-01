import type { FastifyInstance } from 'fastify';
import type { AuthService } from './auth-service.ts';
import type { PluginEventBus } from './plugins/events.ts';

/** Subscriber id on the event bus; the bus's enabled-check must allow it. */
export const REALTIME_SUBSCRIBER = '@realtime';

/** What the server pushes; clients treat unknown types as noise. */
export type RealtimeMessage =
  | { type: 'catalog.updated'; reason: 'added' | 'enriched' | 'removed' | 'availability' }
  /** A plugin started or finished a run, whoever triggered it. */
  | { type: 'plugin.updated'; pluginId: string; status: 'running' | 'succeeded' | 'failed' };

/** The subset of a WebSocket the service needs, so tests can hand in fakes. */
export interface RealtimeSocket {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  on(event: 'close' | 'error', listener: () => void): void;
}

const OPEN = 1;

/**
 * Pushes catalog-change signals to connected browsers.
 *
 * Deliberately content-free: the message says only that the catalog changed.
 * Each client refetches through its own authenticated view, so parental limits
 * and per-user rows are applied by the same code paths as any other request —
 * a push can never leak a title the viewer would not be shown.
 */
export class RealtimeService {
  private readonly sockets = new Set<RealtimeSocket>();

  get connections(): number { return this.sockets.size; }

  add(socket: RealtimeSocket): void {
    this.sockets.add(socket);
    const drop = () => this.sockets.delete(socket);
    socket.on('close', drop);
    socket.on('error', drop);
  }

  broadcast(message: RealtimeMessage): void {
    const data = JSON.stringify(message);
    for (const socket of this.sockets) {
      // A socket that throws or is mid-close is dropped, never retried.
      try { if (socket.readyState === OPEN) socket.send(data); else this.sockets.delete(socket); }
      catch { this.sockets.delete(socket); }
    }
  }

  /**
   * Turn domain events into pushes. New media is announced once enrichment has
   * landed, so the card that fades in already carries its poster and backdrop —
   * not a bare filename that repaints moments later. Servers that cannot enrich
   * (no TMDB token) opt into announcing at ingest instead, or nothing would
   * ever be pushed for them.
   */
  attach(bus: PluginEventBus, options: { announceOnIngest?: boolean } = {}): void {
    if (options.announceOnIngest) {
      bus.subscribe(REALTIME_SUBSCRIBER, 'media.file.ingested', (_event, payload) => {
        if (payload.created) this.broadcast({ type: 'catalog.updated', reason: 'added' });
      });
    }
    bus.subscribe(REALTIME_SUBSCRIBER, 'media.item.enriched', () => this.broadcast({ type: 'catalog.updated', reason: 'added' }));
    bus.subscribe(REALTIME_SUBSCRIBER, 'media.item.removed', () => this.broadcast({ type: 'catalog.updated', reason: 'removed' }));
    bus.subscribe(REALTIME_SUBSCRIBER, 'media.item.archived', () => this.broadcast({ type: 'catalog.updated', reason: 'availability' }));
    bus.subscribe(REALTIME_SUBSCRIBER, 'media.item.unarchived', () => this.broadcast({ type: 'catalog.updated', reason: 'availability' }));
  }

  closeAll(): void {
    for (const socket of this.sockets) {
      try { socket.close(1001, 'Server shutting down'); } catch { /* already gone */ }
    }
    this.sockets.clear();
  }
}

/**
 * The `/api/v1/events` WebSocket endpoint. Requires the same session cookie as
 * every API route; an unauthenticated upgrade is closed with a policy code.
 */
export function registerRealtimeRoute(app: FastifyInstance, auth: AuthService, realtime: RealtimeService, sessionCookie = 'dose_session'): void {
  app.get('/api/v1/events', { websocket: true }, (socket, request) => {
    void (async () => {
      const user = await auth.authenticate((request.cookies as Record<string, string | undefined>)[sessionCookie]);
      if (!user) { socket.close(4401, 'Authentication required'); return; }
      realtime.add(socket as unknown as RealtimeSocket);
    })();
  });
}
