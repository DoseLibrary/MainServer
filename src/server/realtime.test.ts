import cookie from '@fastify/cookie';
import websocket from '@fastify/websocket';
import Fastify from 'fastify';
import WebSocketClient from 'ws';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthService } from './auth-service.ts';
import { PluginEventBus } from './plugins/events.ts';
import { RealtimeService, registerRealtimeRoute, type RealtimeSocket } from './realtime.ts';

function fakeSocket(readyState = 1) {
  const listeners = new Map<string, () => void>();
  return {
    readyState,
    sent: [] as string[],
    send(data: string) { this.sent.push(data); },
    close: vi.fn(),
    on(event: string, listener: () => void) { listeners.set(event, listener); },
    emit(event: string) { listeners.get(event)?.(); },
  };
}

describe('RealtimeService', () => {
  it('announces new media only once enrichment has landed its artwork', async () => {
    const realtime = new RealtimeService();
    const bus = new PluginEventBus({ log: { error: vi.fn(), warn: vi.fn() } });
    realtime.attach(bus);
    const socket = fakeSocket();
    realtime.add(socket as unknown as RealtimeSocket);

    // Ingest alone is silent: the card would fade in without its backdrop.
    bus.emit('media.file.ingested', { libraryId: 'l', mediaItemId: 'i', mediaFileId: 'f', relativePath: 'a.mkv', created: true });
    await bus.drain();
    expect(socket.sent).toHaveLength(0);

    bus.emit('media.item.enriched', { libraryId: 'l', mediaItemId: 'i', kind: 'movie', providerIds: {} });
    await bus.drain();
    expect(socket.sent.map((frame) => JSON.parse(frame))).toEqual([{ type: 'catalog.updated', reason: 'added' }]);
  });

  it('falls back to announcing at ingest when enrichment is unavailable', async () => {
    const realtime = new RealtimeService();
    const bus = new PluginEventBus({ log: { error: vi.fn(), warn: vi.fn() } });
    realtime.attach(bus, { announceOnIngest: true });
    const socket = fakeSocket();
    realtime.add(socket as unknown as RealtimeSocket);

    bus.emit('media.file.ingested', { libraryId: 'l', mediaItemId: 'i', mediaFileId: 'f', relativePath: 'a.mkv', created: true });
    // A re-seen file is not new media; nothing is pushed for it.
    bus.emit('media.file.ingested', { libraryId: 'l', mediaItemId: 'i', mediaFileId: 'f', relativePath: 'a.mkv', created: false });
    await bus.drain();

    expect(socket.sent.map((frame) => JSON.parse(frame))).toEqual([{ type: 'catalog.updated', reason: 'added' }]);
  });

  it('forgets sockets that close and sockets that throw', () => {
    const realtime = new RealtimeService();
    const healthy = fakeSocket();
    const closed = fakeSocket();
    const broken = fakeSocket();
    broken.send = () => { throw new Error('gone'); };
    for (const socket of [healthy, closed, broken]) realtime.add(socket as unknown as RealtimeSocket);
    closed.emit('close');

    realtime.broadcast({ type: 'catalog.updated', reason: 'added' });

    expect(realtime.connections).toBe(1);
    expect(healthy.sent).toHaveLength(1);
    expect(closed.sent).toHaveLength(0);
  });
});

describe('the /api/v1/events endpoint', () => {
  let app: ReturnType<typeof Fastify> | undefined;
  afterEach(async () => { await app?.close(); });

  async function listen(authenticate: (token?: string) => Promise<unknown>) {
    app = Fastify();
    await app.register(cookie);
    await app.register(websocket);
    const realtime = new RealtimeService();
    registerRealtimeRoute(app, { authenticate } as unknown as AuthService, realtime);
    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    return { realtime, address: address.replace('http', 'ws') };
  }

  it('accepts a session cookie and receives broadcasts', async () => {
    const { realtime, address } = await listen(async (token) => (token === 'valid' ? { id: 'u1' } : null));
    // The browser sends the session cookie with the upgrade; `ws` lets tests do the same.
    const client = new WebSocketClient(`${address}/api/v1/events`, { headers: { cookie: 'dose_session=valid' } });
    const firstMessage = new Promise<string>((resolve, reject) => {
      client.on('message', (data) => resolve(String(data)));
      client.on('error', () => reject(new Error('socket error')));
    });
    await new Promise<void>((resolve, reject) => {
      client.on('open', () => resolve());
      client.on('error', () => reject(new Error('connect failed')));
    });
    await vi.waitFor(() => expect(realtime.connections).toBe(1));

    realtime.broadcast({ type: 'catalog.updated', reason: 'added' });

    expect(JSON.parse(await firstMessage)).toEqual({ type: 'catalog.updated', reason: 'added' });
    client.close();
  });

  it('closes an unauthenticated connection with a policy code', async () => {
    const { realtime, address } = await listen(async () => null);
    const client = new WebSocketClient(`${address}/api/v1/events`);

    const code = await new Promise<number>((resolve) => {
      client.on('close', (value) => resolve(value));
    });

    expect(code).toBe(4401);
    expect(realtime.connections).toBe(0);
  });
});
