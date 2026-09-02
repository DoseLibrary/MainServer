import cookie from '@fastify/cookie';
import websocket from '@fastify/websocket';
import Fastify from 'fastify';
import WebSocketClient from 'ws';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthService } from './auth-service.ts';
import type { CatalogService, MovieCard } from './catalog-service.ts';
import { MovieNightHub } from './movie-night-hub.ts';
import { registerMovieNightRoutes } from './movie-night-routes.ts';
import { MovieNightService } from './movie-night-service.ts';

const DECK: MovieCard[] = [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }];
const HOST = { id: 'host-1', username: 'owner', role: 'admin', maxMaturityLevel: null };
const OTHER = { id: 'user-2', username: 'other', role: 'member', maxMaturityLevel: null };

async function appWith() {
  const auth = { authenticate: vi.fn(async (token?: string) => (token === 'host' ? HOST : token === 'other' ? OTHER : null)) } as unknown as AuthService;
  const listMovieCards = vi.fn(async () => DECK);
  const countMovieCards = vi.fn(async () => 2);
  const forViewer = vi.fn(() => ({ listMovieCards, countMovieCards }));
  const catalog = { forViewer } as unknown as CatalogService;
  const service = new MovieNightService(async (filters, hostId, maturity) => catalog.forViewer(maturity).listMovieCards(filters, hostId));
  const hub = new MovieNightHub(service);
  const app = Fastify(); await app.register(cookie); await app.register(websocket);
  registerMovieNightRoutes(app, auth, catalog, service, hub);
  return { app, service, hub, listMovieCards, countMovieCards, forViewer };
}

const hostHeaders = { cookie: 'dose_session=host' };
const otherHeaders = { cookie: 'dose_session=other' };
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

describe('movie night routes', () => {
  let app: Awaited<ReturnType<typeof appWith>>['app'] | undefined;
  afterEach(async () => { await app?.close(); });

  it('creates a session for a signed-in host through their catalog view', async () => {
    const built = await appWith(); app = built.app;
    expect((await app.inject({ method: 'POST', url: '/api/v1/movie-night', payload: {} })).statusCode).toBe(401);
    const created = await app.inject({ method: 'POST', url: '/api/v1/movie-night', headers: hostHeaders, payload: { genre: 'drama', unwatchedOnly: true } });
    expect(created.statusCode).toBe(200);
    expect(created.json()).toMatchObject({ code: expect.stringMatching(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/), deckSize: 2 });
    expect(created.json().joinPath).toBe(`/movie-night/join?code=${created.json().code}`);
    expect(built.forViewer).toHaveBeenCalledWith(null);
    expect(built.listMovieCards).toHaveBeenCalledWith({ genre: 'drama', unwatchedOnly: true }, 'host-1');
    const count = await app.inject({ method: 'GET', url: '/api/v1/movie-night/count?ratingMin=7&unwatchedOnly=true', headers: hostHeaders });
    expect(count.json()).toEqual({ count: 2 });
    expect(built.countMovieCards).toHaveBeenCalledWith({ ratingMin: 7, unwatchedOnly: true }, 'host-1');
    expect((await app.inject({ method: 'POST', url: '/api/v1/movie-night', headers: hostHeaders, payload: { yearMin: 2020, yearMax: 2000 } })).statusCode).toBe(400);
  });

  it('lets a guest join without a cookie and use the token afterwards', async () => {
    const built = await appWith(); app = built.app;
    const { code } = (await app.inject({ method: 'POST', url: '/api/v1/movie-night', headers: hostHeaders, payload: {} })).json();
    const joined = await app.inject({ method: 'POST', url: `/api/v1/movie-night/${code}/join`, payload: { nickname: 'Ann' } });
    expect(joined.statusCode).toBe(200);
    const { participantId, token } = joined.json();
    expect((await app.inject({ method: 'POST', url: `/api/v1/movie-night/${code}/join`, payload: { nickname: 'ann' } })).statusCode).toBe(409);
    expect((await app.inject({ method: 'POST', url: `/api/v1/movie-night/ZZZZ-ZZZZ/join`, payload: { nickname: 'Bob' } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/api/v1/movie-night/${code}/join`, payload: { nickname: '' } })).statusCode).toBe(400);

    expect((await app.inject({ method: 'GET', url: `/api/v1/movie-night/${code}/deck` })).statusCode).toBe(401);
    const deck = await app.inject({ method: 'GET', url: `/api/v1/movie-night/${code}/deck`, headers: bearer(token) });
    expect(deck.json().cards.map((c: MovieCard) => c.id).sort()).toEqual(['a', 'b']);

    const asGuest = await app.inject({ method: 'GET', url: `/api/v1/movie-night/${code}`, headers: bearer(token) });
    expect(asGuest.json()).toMatchObject({ role: 'participant', state: { participantId, votes: {} } });
    const asHost = await app.inject({ method: 'GET', url: `/api/v1/movie-night/${code}`, headers: hostHeaders });
    expect(asHost.json()).toMatchObject({ role: 'host', state: { phase: 'lobby' } });
    expect(asHost.json().state.votes).toBeUndefined();
    expect((await app.inject({ method: 'GET', url: `/api/v1/movie-night/${code}` })).statusCode).toBe(401);
  });

  it('gates phase control to the host and votes to participants', async () => {
    const built = await appWith(); app = built.app;
    const { code } = (await app.inject({ method: 'POST', url: '/api/v1/movie-night', headers: hostHeaders, payload: {} })).json();
    const ann = (await app.inject({ method: 'POST', url: `/api/v1/movie-night/${code}/join`, payload: { nickname: 'Ann' } })).json();
    expect((await app.inject({ method: 'PUT', url: `/api/v1/movie-night/${code}/votes/a`, headers: bearer(ann.token), payload: { vote: 'yes' } })).statusCode).toBe(409);
    // A bearer token is not a signed-in Dose user, so the host routes answer 401, not 403.
    expect((await app.inject({ method: 'POST', url: `/api/v1/movie-night/${code}/start`, headers: bearer(ann.token) })).statusCode).toBe(401);
    // A signed-in user who is not the host is the 403 case.
    expect((await app.inject({ method: 'POST', url: `/api/v1/movie-night/${code}/start`, headers: otherHeaders })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: `/api/v1/movie-night/${code}/start`, headers: hostHeaders })).statusCode).toBe(200);
    expect((await app.inject({ method: 'PUT', url: `/api/v1/movie-night/${code}/votes/a`, headers: bearer(ann.token), payload: { vote: 'yes' } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'PUT', url: `/api/v1/movie-night/${code}/votes/a`, headers: bearer(ann.token), payload: { vote: 'later' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PUT', url: `/api/v1/movie-night/${code}/votes/zzz`, headers: bearer(ann.token), payload: { vote: 'yes' } })).statusCode).toBe(404);
    const state = (await app.inject({ method: 'GET', url: `/api/v1/movie-night/${code}`, headers: hostHeaders })).json().state;
    expect(state.matches.map((c: MovieCard) => c.id)).toEqual(['a']);
    expect((await app.inject({ method: 'GET', url: `/api/v1/movie-night/${code}/leaders`, headers: bearer(ann.token) })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: `/api/v1/movie-night/${code}/leaders`, headers: hostHeaders })).json().entries[0]).toMatchObject({ card: { id: 'a' }, yes: 1 });
    expect((await app.inject({ method: 'POST', url: `/api/v1/movie-night/${code}/dismiss/a`, headers: hostHeaders })).statusCode).toBe(200);
    expect((await app.inject({ method: 'DELETE', url: `/api/v1/movie-night/${code}/votes/a`, headers: bearer(ann.token) })).statusCode).toBe(200);
  });

  it('allows a participant to leave and the host to kick', async () => {
    const built = await appWith(); app = built.app;
    const { code } = (await app.inject({ method: 'POST', url: '/api/v1/movie-night', headers: hostHeaders, payload: {} })).json();
    const ann = (await app.inject({ method: 'POST', url: `/api/v1/movie-night/${code}/join`, payload: { nickname: 'Ann' } })).json();
    const bob = (await app.inject({ method: 'POST', url: `/api/v1/movie-night/${code}/join`, payload: { nickname: 'Bob' } })).json();
    expect((await app.inject({ method: 'DELETE', url: `/api/v1/movie-night/${code}/participants/${bob.participantId}`, headers: bearer(ann.token) })).statusCode).toBe(403);
    expect((await app.inject({ method: 'DELETE', url: `/api/v1/movie-night/${code}/participants/${ann.participantId}`, headers: bearer(ann.token) })).statusCode).toBe(200);
    expect((await app.inject({ method: 'DELETE', url: `/api/v1/movie-night/${code}/participants/${bob.participantId}`, headers: hostHeaders })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/api/v1/movie-night/${code}`, headers: hostHeaders })).json().state.participants).toEqual([]);
    expect((await app.inject({ method: 'POST', url: `/api/v1/movie-night/${code}/end`, headers: hostHeaders })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/api/v1/movie-night/${code}`, headers: hostHeaders })).statusCode).toBe(404);
  });

  it('closes the socket 4401 for any auth failure and 4404 only once the caller is known', async () => {
    const built = await appWith(); app = built.app;
    const { code } = (await app.inject({ method: 'POST', url: '/api/v1/movie-night', headers: hostHeaders, payload: {} })).json();
    const address = (await app.listen({ port: 0, host: '127.0.0.1' })).replace('http', 'ws');

    const closeCode = (url: string, headers?: Record<string, string>) => new Promise<number>((resolve, reject) => {
      const client = new WebSocketClient(url, { headers });
      client.on('close', (value) => resolve(value));
      client.on('error', () => reject(new Error('socket error')));
    });

    // Nothing to authenticate: the caller learns nothing about which codes exist.
    await expect(closeCode(`${address}/api/v1/movie-night/ZZZZ-ZZZZ/socket`)).resolves.toBe(4401);
    await expect(closeCode(`${address}/api/v1/movie-night/${code}/socket`)).resolves.toBe(4401);
    // A token can only be checked against a live session, so a bad one is an auth failure.
    await expect(closeCode(`${address}/api/v1/movie-night/${code}/socket?token=bogus`)).resolves.toBe(4401);
    await expect(closeCode(`${address}/api/v1/movie-night/ZZZZ-ZZZZ/socket?token=bogus`)).resolves.toBe(4401);
    // A recognised user asking after a session that is gone gets the informative code.
    await expect(closeCode(`${address}/api/v1/movie-night/ZZZZ-ZZZZ/socket`, { cookie: 'dose_session=host' })).resolves.toBe(4404);
  });

  it('reports each participant progress to the host state and to nobody else', async () => {
    const built = await appWith(); app = built.app;
    const { code } = (await app.inject({ method: 'POST', url: '/api/v1/movie-night', headers: hostHeaders, payload: {} })).json();
    const ann = (await app.inject({ method: 'POST', url: `/api/v1/movie-night/${code}/join`, payload: { nickname: 'Ann' } })).json();
    await app.inject({ method: 'POST', url: `/api/v1/movie-night/${code}/start`, headers: hostHeaders });
    await app.inject({ method: 'PUT', url: `/api/v1/movie-night/${code}/votes/a`, headers: bearer(ann.token), payload: { vote: 'yes' } });
    const asHost = (await app.inject({ method: 'GET', url: `/api/v1/movie-night/${code}`, headers: hostHeaders })).json();
    expect(asHost.state.progress).toEqual({ [ann.participantId]: 1 });
    const asGuest = (await app.inject({ method: 'GET', url: `/api/v1/movie-night/${code}`, headers: bearer(ann.token) })).json();
    expect(asGuest.state.progress).toBeUndefined();
  });

  it('throttles a flood of joins from one address', async () => {
    const built = await appWith(); app = built.app;
    const { code } = (await app.inject({ method: 'POST', url: '/api/v1/movie-night', headers: hostHeaders, payload: {} })).json();
    const statuses: number[] = [];
    for (let index = 0; index < 31; index++) {
      statuses.push((await app.inject({ method: 'POST', url: `/api/v1/movie-night/${code}/join`, payload: { nickname: `p${index}` } })).statusCode);
    }
    expect(statuses[0]).toBe(200);
    expect(statuses[statuses.length - 1]).toBe(429);
    expect(statuses.filter((status) => status === 429)).toHaveLength(1);
  });
});

describe('movie night socket', () => {
  it('delivers matches to phones and leaders only to the host', async () => {
    const built = await appWith();
    const address = (await built.app.listen({ port: 0, host: '127.0.0.1' })).replace('http', 'ws');
    try {
      const { code } = (await built.app.inject({ method: 'POST', url: '/api/v1/movie-night', headers: hostHeaders, payload: {} })).json();
      const ann = (await built.app.inject({ method: 'POST', url: `/api/v1/movie-night/${code}/join`, payload: { nickname: 'Ann' } })).json();
      const open = (client: WebSocketClient) => new Promise<void>((resolve, reject) => { client.on('open', () => resolve()); client.on('error', () => reject(new Error('connect failed'))); });
      const tv = new WebSocketClient(`${address}/api/v1/movie-night/${code}/socket`, { headers: { cookie: 'dose_session=host' } });
      const phone = new WebSocketClient(`${address}/api/v1/movie-night/${code}/socket?token=${ann.token}`);
      const tvFrames: string[] = []; const phoneFrames: string[] = [];
      tv.on('message', (d) => tvFrames.push(JSON.parse(String(d)).type));
      phone.on('message', (d) => phoneFrames.push(JSON.parse(String(d)).type));
      await Promise.all([open(tv), open(phone)]);
      // Both sockets must be registered with the hub before the first event, or the
      // frames below race the subscription rather than the fan-out being tested.
      await vi.waitFor(() => expect(built.hub.connections(code)).toBe(2));

      await built.app.inject({ method: 'POST', url: `/api/v1/movie-night/${code}/start`, headers: hostHeaders });
      await built.app.inject({ method: 'PUT', url: `/api/v1/movie-night/${code}/votes/a`, headers: bearer(ann.token), payload: { vote: 'yes' } });
      await vi.waitFor(() => expect(phoneFrames).toContain('match'));
      expect(tvFrames).toContain('leaders');
      expect(phoneFrames).not.toContain('leaders');

      const stranger = new WebSocketClient(`${address}/api/v1/movie-night/${code}/socket?token=bogus`);
      const closeCode = await new Promise<number>((resolve) => stranger.on('close', resolve));
      expect(closeCode).toBe(4401);
      tv.close(); phone.close();
    } finally { await built.app.close(); }
  });
});
