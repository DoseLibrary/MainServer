import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AuthService, PublicUser } from './auth-service.ts';
import type { CatalogService } from './catalog-service.ts';
import type { MovieNightHub } from './movie-night-hub.ts';
import { MovieNightError, normalizeCode, type MovieNightService, type Participant } from './movie-night-service.ts';
import type { RealtimeSocket } from './realtime.ts';
import { SESSION_COOKIE } from './security.ts';

const filtersSchema = z.object({
  genre: z.string().trim().min(1).max(120).optional(),
  yearMin: z.coerce.number().int().min(1888).max(2200).optional(),
  yearMax: z.coerce.number().int().min(1888).max(2200).optional(),
  ratingMin: z.coerce.number().min(0).max(10).optional(),
  unwatchedOnly: z.union([z.boolean(), z.enum(['true', 'false']).transform((v) => v === 'true')]).optional(),
}).refine((v) => v.yearMin == null || v.yearMax == null || v.yearMin <= v.yearMax, { message: 'yearMin must not exceed yearMax' });
const codeParams = z.object({ code: z.string().trim().min(8).max(9) });
const cardParams = codeParams.extend({ cardId: z.string().min(1).max(64) });
const participantParams = codeParams.extend({ id: z.string().min(1).max(64) });
const joinBody = z.object({ nickname: z.string().max(200) });
const voteBody = z.object({ vote: z.enum(['yes', 'no', 'maybe']) });

const STATUS: Record<MovieNightError['reason'], number> = {
  not_found: 404, nickname_taken: 409, invalid_nickname: 400, full: 409, forbidden: 403, wrong_phase: 409, unknown_card: 404, throttled: 429,
};
const MESSAGE: Record<MovieNightError['reason'], string> = {
  not_found: 'No movie night with that code', nickname_taken: 'That name is taken', invalid_nickname: 'Pick a name between 1 and 24 characters',
  full: 'This movie night is full', forbidden: 'Only the host can do that', wrong_phase: 'Not possible right now', unknown_card: 'Unknown title', throttled: 'Too many attempts, slow down',
};

function fail(error: unknown, reply: FastifyReply) {
  if (error instanceof MovieNightError) return reply.status(STATUS[error.reason]).send({ error: MESSAGE[error.reason], reason: error.reason });
  throw error;
}

function bearerToken(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
}

type Caller = { role: 'host'; user: PublicUser } | { role: 'participant'; participant: Participant };

/**
 * Movie night: the host is a signed-in Dose user; guests carry only a
 * participant bearer token minted at join. The socket accepts either.
 */
export function registerMovieNightRoutes(app: FastifyInstance, auth: AuthService, catalog: CatalogService, service: MovieNightService, hub: MovieNightHub, sessionCookie = SESSION_COOKIE): void {
  const cookieOf = (request: FastifyRequest) => (request.cookies as Record<string, string | undefined>)[sessionCookie];

  async function requireHost(request: FastifyRequest, reply: FastifyReply): Promise<PublicUser | undefined> {
    const user = await auth.authenticate(cookieOf(request));
    if (!user) { void reply.status(401).send({ error: 'Authentication required' }); return undefined; }
    return user as PublicUser;
  }

  /** Host cookie first, then a participant bearer token. */
  async function identify(request: FastifyRequest, code: string): Promise<Caller | undefined> {
    const user = await auth.authenticate(cookieOf(request));
    if (user && service.isHost(code, user.id)) return { role: 'host', user: user as PublicUser };
    const token = bearerToken(request);
    if (token) return { role: 'participant', participant: service.authenticateParticipant(code, token) };
    return undefined;
  }

  app.post('/api/v1/movie-night', async (request, reply) => {
    const user = await requireHost(request, reply); if (!user) return;
    const body = filtersSchema.safeParse(request.body ?? {});
    if (!body.success) return reply.status(400).send({ error: 'Invalid filters' });
    const created = await service.create({ id: user.id, maxMaturityLevel: user.maxMaturityLevel }, body.data);
    return { ...created, joinPath: `/movie-night/join?code=${created.code}` };
  });

  app.get('/api/v1/movie-night/count', async (request, reply) => {
    const user = await requireHost(request, reply); if (!user) return;
    const query = filtersSchema.safeParse(request.query ?? {});
    if (!query.success) return reply.status(400).send({ error: 'Invalid filters' });
    return { count: await catalog.forViewer(user.maxMaturityLevel).countMovieCards(query.data, user.id) };
  });

  app.get('/api/v1/movie-night/:code', async (request, reply) => {
    const params = codeParams.safeParse(request.params); if (!params.success) return reply.status(400).send({ error: 'Invalid code' });
    const code = normalizeCode(params.data.code);
    try {
      const caller = await identify(request, code);
      if (!caller) return reply.status(401).send({ error: 'Authentication required' });
      return { role: caller.role, state: service.state(code, caller.role === 'participant' ? caller.participant.id : undefined) };
    } catch (error) { return fail(error, reply); }
  });

  app.post('/api/v1/movie-night/:code/join', async (request, reply) => {
    const params = codeParams.safeParse(request.params); if (!params.success) return reply.status(400).send({ error: 'Invalid code' });
    const body = joinBody.safeParse(request.body); if (!body.success) return reply.status(400).send({ error: MESSAGE.invalid_nickname, reason: 'invalid_nickname' });
    try { return service.join(params.data.code, body.data.nickname, request.ip); }
    catch (error) { return fail(error, reply); }
  });

  app.get('/api/v1/movie-night/:code/deck', async (request, reply) => {
    const params = codeParams.safeParse(request.params); if (!params.success) return reply.status(400).send({ error: 'Invalid code' });
    const code = normalizeCode(params.data.code);
    try {
      const caller = await identify(request, code);
      if (!caller) return reply.status(401).send({ error: 'Authentication required' });
      return { cards: service.deck(code) };
    } catch (error) { return fail(error, reply); }
  });

  app.put('/api/v1/movie-night/:code/votes/:cardId', async (request, reply) => {
    const params = cardParams.safeParse(request.params); if (!params.success) return reply.status(400).send({ error: 'Invalid code' });
    const body = voteBody.safeParse(request.body); if (!body.success) return reply.status(400).send({ error: 'Invalid vote' });
    const code = normalizeCode(params.data.code);
    try {
      const token = bearerToken(request); if (!token) return reply.status(401).send({ error: 'Authentication required' });
      const participant = service.authenticateParticipant(code, token);
      service.vote(code, participant.id, params.data.cardId, body.data.vote);
      return { ok: true };
    } catch (error) { return fail(error, reply); }
  });

  app.delete('/api/v1/movie-night/:code/votes/:cardId', async (request, reply) => {
    const params = cardParams.safeParse(request.params); if (!params.success) return reply.status(400).send({ error: 'Invalid code' });
    const code = normalizeCode(params.data.code);
    try {
      const token = bearerToken(request); if (!token) return reply.status(401).send({ error: 'Authentication required' });
      const participant = service.authenticateParticipant(code, token);
      service.undo(code, participant.id, params.data.cardId);
      return { ok: true };
    } catch (error) { return fail(error, reply); }
  });

  app.delete('/api/v1/movie-night/:code/participants/:id', async (request, reply) => {
    const params = participantParams.safeParse(request.params); if (!params.success) return reply.status(400).send({ error: 'Invalid code' });
    const code = normalizeCode(params.data.code);
    try {
      const caller = await identify(request, code);
      if (!caller) return reply.status(401).send({ error: 'Authentication required' });
      if (caller.role === 'participant' && caller.participant.id !== params.data.id) throw new MovieNightError('forbidden');
      service.leave(code, params.data.id);
      return { ok: true };
    } catch (error) { return fail(error, reply); }
  });

  for (const action of ['start', 'end'] as const) {
    app.post(`/api/v1/movie-night/:code/${action}`, async (request, reply) => {
      const params = codeParams.safeParse(request.params); if (!params.success) return reply.status(400).send({ error: 'Invalid code' });
      const user = await auth.authenticate(cookieOf(request));
      try {
        if (!user) throw new MovieNightError('forbidden');
        service[action](normalizeCode(params.data.code), user.id);
        return { ok: true };
      } catch (error) { return fail(error, reply); }
    });
  }

  app.post('/api/v1/movie-night/:code/dismiss/:cardId', async (request, reply) => {
    const params = cardParams.safeParse(request.params); if (!params.success) return reply.status(400).send({ error: 'Invalid code' });
    const user = await auth.authenticate(cookieOf(request));
    try {
      if (!user) throw new MovieNightError('forbidden');
      service.dismiss(normalizeCode(params.data.code), user.id, params.data.cardId);
      return { ok: true };
    } catch (error) { return fail(error, reply); }
  });

  app.get('/api/v1/movie-night/:code/leaders', async (request, reply) => {
    const params = codeParams.safeParse(request.params); if (!params.success) return reply.status(400).send({ error: 'Invalid code' });
    const code = normalizeCode(params.data.code);
    try {
      const user = await auth.authenticate(cookieOf(request));
      if (!user || !service.isHost(code, user.id)) throw new MovieNightError('forbidden');
      return { entries: service.leaders(code) };
    } catch (error) { return fail(error, reply); }
  });

  app.get('/api/v1/movie-night/:code/socket', { websocket: true }, (socket, request) => {
    void (async () => {
      const params = codeParams.safeParse(request.params);
      if (!params.success) { socket.close(4404, 'Unknown movie night'); return; }
      const code = normalizeCode(params.data.code);
      try {
        const user = await auth.authenticate(cookieOf(request));
        if (user && service.isHost(code, user.id)) { hub.add(code, socket as unknown as RealtimeSocket, 'host'); return; }
        const token = (request.query as Record<string, string | undefined>).token;
        if (!token) { socket.close(4401, 'Authentication required'); return; }
        service.authenticateParticipant(code, token);
        hub.add(code, socket as unknown as RealtimeSocket, 'participant');
      } catch (error) {
        socket.close(error instanceof MovieNightError && error.reason === 'not_found' ? 4404 : 4401, 'Not allowed');
      }
    })();
  });
}
