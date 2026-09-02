# Movie Night Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A TV shows a QR code, guests scan it and swipe a shared shuffled movie deck on their phones; the first title everyone says yes to is announced on the TV and every phone.

**Architecture:** An in-memory `MovieNightService` (no DB) owns sessions, participants, votes and match detection, and emits events; a `MovieNightHub` fans those events out over a dedicated WebSocket per session. Routes under `/api/v1/movie-night` use the host's session cookie or a guest participant bearer token. The React client adds a TV route and a phone route, plus a pointer-driven swipe deck.

**Tech Stack:** Fastify 5 + `@fastify/websocket`, zod 4, drizzle (only for the deck query), React 19, react-router 7, Tailwind 4, vitest + testing-library, `qrcode`.

**Spec:** `docs/superpowers/specs/2026-09-02-movie-night-design.md`

## Global Constraints

- Movies only. Deck capped at 500 cards, built once, shuffled with an injectable random source.
- Nickname: trimmed, 1–24 chars, unique per session case-insensitively → 409 on clash.
- Max 20 participants per session. Codes use alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, 8 chars, shown `XXXX-XXXX`.
- Match = every current participant voted `yes`, card not already matched or dismissed. One new match per check, deck order.
- Fallback ranking: yes desc, maybe desc, deck order; top 10.
- Session idle TTL 6 h; sweep on create. Unknown code → 404.
- Phones never receive other people's votes. TV gets aggregates only.
- Guest token sent as `Authorization: Bearer <token>` on HTTP and `?token=` on the socket.
- Existing `/api/v1/events` channel is not touched.
- Run tests with `bun run test -- <file>`; typecheck with `bun run build` (tsc -b) or `bunx tsc -p tsconfig.server.json --noEmit`; lint with `bun run lint`.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## File map

| File | Responsibility |
| --- | --- |
| `src/server/catalog-service.ts` (modify) | `listMovieCards(filters, viewerIdForUnwatched?)` — the deck query |
| `src/server/movie-night-service.ts` (create) | Sessions, participants, votes, matches, leaders, sweep, join throttle; emits events |
| `src/server/movie-night-hub.ts` (create) | Sockets per session, routes service events to `all` / `host` audiences |
| `src/server/movie-night-routes.ts` (create) | HTTP routes + WebSocket route, cookie/bearer auth |
| `src/server/app.ts` (modify) | Wire service, hub, routes |
| `src/lib/api.ts` (modify) | Types + `api.movieNight.*` calls |
| `src/lib/movie-night.ts` (create) | Token storage, `useMovieNightSocket` |
| `src/components/movie-night/MovieCardFace.tsx` (create) | Poster/title/rating/overview face |
| `src/components/movie-night/SwipeCard.tsx` (create) | Pointer drag, rotation, fly-out, snap-back |
| `src/components/movie-night/SwipeDeck.tsx` (create) | Top-3 stack, vote buttons, undo |
| `src/components/movie-night/MatchOverlay.tsx` (create) | Full-screen match (phone + TV) |
| `src/routes/MovieNightJoin.tsx` (create) | Phone route |
| `src/routes/MovieNightTv.tsx` (create) | TV route: setup, lobby, board, match, fallback |
| `src/routes/router.tsx`, `src/components/media/UserMenu.tsx` (modify) | Entry points |

---

### Task 1: Deck query in CatalogService

**Files:**
- Modify: `src/server/catalog-service.ts` (next to `randomItem`, ~line 91)
- Test: `src/server/catalog-service.test.ts` (append a new `describe`)

**Interfaces:**
- Produces:
  ```ts
  export interface MovieDeckFilters { genre?: string; yearMin?: number; yearMax?: number; ratingMin?: number; unwatchedOnly?: boolean }
  export interface MovieCard { id: string; title: string; year?: number; posterUrl?: string; rating?: number; overview?: string; runtimeMinutes?: number }
  CatalogService.listMovieCards(filters: MovieDeckFilters, viewerId?: string): Promise<MovieCard[]>   // max 500, stable id order (shuffling is the service's job)
  CatalogService.countMovieCards(filters: MovieDeckFilters, viewerId?: string): Promise<number>
  ```

- [ ] **Step 1: Write the failing test**

Append to `src/server/catalog-service.test.ts`:

```ts
describe('CatalogService movie deck', () => {
  let client: PGlite;
  let service: CatalogService;
  const LIB2 = '10000000-0000-4000-8000-000000000002';
  const A = '20000000-0000-4000-8000-000000000011';
  const B = '20000000-0000-4000-8000-000000000012';
  const C = '20000000-0000-4000-8000-000000000013';
  const SERIES = '20000000-0000-4000-8000-000000000014';
  const FILE_A = '30000000-0000-4000-8000-000000000011';
  const VIEWER = '70000000-0000-4000-8000-000000000002';
  const G = '40000000-0000-4000-8000-000000000002';

  beforeEach(async () => {
    client = new PGlite('memory://');
    const database = drizzle(client) as unknown as Database;
    await migrate(database as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') });
    service = new CatalogService(database);
    await client.query(`insert into libraries (id, name, kind, root_path) values ($1, 'Movies', 'movies', '/media')`, [LIB2]);
    await client.query(`insert into users (id, username, password_hash, role) values ($1, 'viewer', 'x', 'member')`, [VIEWER]);
    await client.query(`insert into media_items (id, library_id, kind, natural_key, title, sort_title, year, overview, provider_rating, poster_path, maturity_level) values ($1, $2, 'movie', 'movie:a:2001', 'Alpha', 'alpha', 2001, 'First', 8.1, '/a.jpg', 1)`, [A, LIB2]);
    await client.query(`insert into media_items (id, library_id, kind, natural_key, title, sort_title, year, provider_rating, maturity_level) values ($1, $2, 'movie', 'movie:b:2015', 'Beta', 'beta', 2015, 6.0, 4)`, [B, LIB2]);
    await client.query(`insert into media_items (id, library_id, kind, natural_key, title, sort_title, year, provider_rating) values ($1, $2, 'movie', 'movie:c:2020', 'Gamma', 'gamma', 2020, 7.0)`, [C, LIB2]);
    await client.query(`insert into media_items (id, library_id, kind, natural_key, title, sort_title, year) values ($1, $2, 'series', 'series:s', 'Show', 'show', 2020)`, [SERIES, LIB2]);
    await client.query(`insert into media_files (id, media_item_id, library_id, relative_path, size_bytes, modified_at, duration_seconds) values ($1, $2, $3, 'A.mkv', 1, now(), 5400)`, [FILE_A, A, LIB2]);
    await client.query(`insert into genres (id, library_id, provider_id, name, normalized_name) values ($1, $2, '1', 'Drama', 'drama')`, [G, LIB2]);
    await client.query(`insert into media_item_genres (media_item_id, genre_id, position) values ($1, $2, 0)`, [A, G]);
    await client.query(`insert into playback_progress (user_id, media_item_id, watched) values ($1, $2, true)`, [VIEWER, B]);
  });
  afterEach(async () => { await client.close(); });

  it('lists top-level movies as cards with runtime and rating', async () => {
    const cards = await service.listMovieCards({});
    expect(cards.map((card) => card.title).sort()).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(cards.find((card) => card.id === A)).toEqual({ id: A, title: 'Alpha', year: 2001, posterUrl: '/api/v1/images/a.jpg', rating: 8.1, overview: 'First', runtimeMinutes: 90 });
    expect(await service.countMovieCards({})).toBe(3);
  });

  it('applies genre, year, rating and unwatched filters', async () => {
    expect((await service.listMovieCards({ genre: 'drama' })).map((c) => c.id)).toEqual([A]);
    expect((await service.listMovieCards({ yearMin: 2010, yearMax: 2016 })).map((c) => c.id)).toEqual([B]);
    expect((await service.listMovieCards({ ratingMin: 7 })).map((c) => c.id).sort()).toEqual([A, C].sort());
    expect((await service.listMovieCards({ unwatchedOnly: true }, VIEWER)).map((c) => c.id).sort()).toEqual([A, C].sort());
    expect(await service.countMovieCards({ unwatchedOnly: true }, VIEWER)).toBe(2);
  });

  it('respects the viewer maturity limit', async () => {
    const limited = service.forViewer(2);
    // Gamma is unrated and therefore hidden from a restricted viewer.
    expect((await limited.listMovieCards({})).map((c) => c.id)).toEqual([A]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- src/server/catalog-service.test.ts -t "movie deck"`
Expected: FAIL — `service.listMovieCards is not a function`.

- [ ] **Step 3: Implement**

In `src/server/catalog-service.ts`, after `RandomItemFilters`:

```ts
export interface MovieDeckFilters {
  genre?: string;
  yearMin?: number;
  yearMax?: number;
  ratingMin?: number;
  /** Drop titles the viewer has already marked watched. */
  unwatchedOnly?: boolean;
}

/** One card in a movie-night deck: everything a phone shows without another request. */
export interface MovieCard {
  id: string;
  title: string;
  year?: number;
  posterUrl?: string;
  rating?: number;
  overview?: string;
  runtimeMinutes?: number;
}

export const MOVIE_DECK_LIMIT = 500;
```

Inside the class, after `randomItem`:

```ts
  private movieDeckClauses(filters: MovieDeckFilters, viewerId?: string) {
    const clauses = [
      eq(mediaItems.available, true), this.withinMaturity,
      isNull(mediaItems.archivedAt), isNull(mediaItems.parentId),
      eq(mediaItems.kind, 'movie'),
    ];
    if (filters.yearMin != null) clauses.push(sql`${mediaItems.year} >= ${filters.yearMin}`);
    if (filters.yearMax != null) clauses.push(sql`${mediaItems.year} <= ${filters.yearMax}`);
    if (filters.ratingMin != null) clauses.push(sql`${mediaItems.providerRating} >= ${filters.ratingMin}`);
    if (filters.genre) {
      const genre = filters.genre.trim().toLowerCase();
      clauses.push(sql`exists (
        select 1 from ${mediaItemGenres}
        inner join ${genres} on ${genres.id} = ${mediaItemGenres.genreId}
        where ${mediaItemGenres.mediaItemId} = ${mediaItems.id}
          and (lower(${genres.name}) = ${genre} or ${genres.normalizedName} = ${genre})
      )`);
    }
    if (filters.unwatchedOnly && viewerId) {
      clauses.push(sql`not exists (
        select 1 from ${playbackProgress}
        where ${playbackProgress.mediaItemId} = ${mediaItems.id}
          and ${playbackProgress.userId} = ${viewerId}
          and ${playbackProgress.watched} = true
      )`);
    }
    return and(...clauses);
  }

  /** Every movie the viewer may see that matches the filters, as deck cards. Unshuffled; capped. */
  async listMovieCards(filters: MovieDeckFilters, viewerId?: string): Promise<MovieCard[]> {
    const runtime = sql<number | null>`(select max(${mediaFiles.durationSeconds}) from ${mediaFiles} where ${mediaFiles.mediaItemId} = ${mediaItems.id})`;
    const rows = await this.database.select({
      id: mediaItems.id, title: mediaItems.title, userTitle: mediaItems.userTitle,
      year: mediaItems.year, userYear: mediaItems.userYear,
      posterPath: mediaItems.posterPath, overview: mediaItems.overview, userOverview: mediaItems.userOverview,
      providerRating: mediaItems.providerRating, durationSeconds: runtime,
    }).from(mediaItems).where(this.movieDeckClauses(filters, viewerId)).orderBy(mediaItems.id).limit(MOVIE_DECK_LIMIT);
    return rows.map((row) => ({
      id: row.id,
      title: row.userTitle ?? row.title,
      year: row.userYear ?? row.year ?? undefined,
      posterUrl: row.posterPath ? imageLocalUrl(row.posterPath) : undefined,
      rating: row.providerRating ?? undefined,
      overview: row.userOverview ?? row.overview ?? undefined,
      runtimeMinutes: row.durationSeconds ? Math.round(row.durationSeconds / 60) : undefined,
    }));
  }

  async countMovieCards(filters: MovieDeckFilters, viewerId?: string): Promise<number> {
    const [row] = await this.database.select({ count: sql<number>`count(*)::int` }).from(mediaItems).where(this.movieDeckClauses(filters, viewerId));
    return row?.count ?? 0;
  }
```

Make sure `playbackProgress` and `mediaFiles` are imported from `./db/schema.ts` at the top of the file (check the existing import line and extend it).

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- src/server/catalog-service.test.ts -t "movie deck"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/catalog-service.ts src/server/catalog-service.test.ts
git commit -m "feat(catalog): movie deck query for movie night"
```

---

### Task 2: MovieNightService — sessions, joining, state

**Files:**
- Create: `src/server/movie-night-service.ts`
- Test: `src/server/movie-night-service.test.ts`

**Interfaces:**
- Consumes: `MovieCard`, `MovieDeckFilters` from `./catalog-service.ts`.
- Produces (used by Tasks 3–6):
  ```ts
  export type Vote = 'yes' | 'no' | 'maybe';
  export type Phase = 'lobby' | 'swiping' | 'ended';
  export interface Participant { id: string; nickname: string; joinedAt: number }
  export interface MovieNightEvent { code: string; audience: 'all' | 'host'; message: MovieNightMessage }
  export type MovieNightMessage =
    | { type: 'participant.joined'; participant: Participant }
    | { type: 'participant.left'; participantId: string }
    | { type: 'phase.changed'; phase: Phase }
    | { type: 'progress'; participantId: string; done: number; total: number }
    | { type: 'match'; card: MovieCard }
    | { type: 'match.dismissed'; cardId: string }
    | { type: 'leaders'; entries: LeaderEntry[] }
    | { type: 'ended' };
  export interface LeaderEntry { card: MovieCard; yes: number; maybe: number }
  export interface PublicState {
    code: string; phase: Phase; deckSize: number; participants: Participant[];
    matches: MovieCard[]; dismissed: string[]; allDone: boolean;
    /** Only when the caller is a participant. */
    votes?: Record<string, Vote>; participantId?: string;
  }
  export class MovieNightError extends Error { constructor(readonly reason: 'not_found' | 'nickname_taken' | 'full' | 'forbidden' | 'wrong_phase' | 'unknown_card' | 'throttled') }
  export type DeckSource = (filters: MovieDeckFilters, hostUserId: string, maturity: number | null) => Promise<MovieCard[]>;
  export class MovieNightService {
    constructor(deckSource: DeckSource, options?: { now?: () => number; random?: () => number; ttlMs?: number });
    onEvent(listener: (event: MovieNightEvent) => void): () => void;
    create(host: { id: string; maxMaturityLevel: number | null }, filters: MovieDeckFilters): Promise<{ code: string; deckSize: number }>;
    join(code: string, nickname: string, address: string): { participantId: string; token: string };
    authenticateParticipant(code: string, token: string): Participant;   // throws not_found
    isHost(code: string, userId: string): boolean;
    state(code: string, participantId?: string): PublicState;
    deck(code: string): MovieCard[];
  }
  ```

- [ ] **Step 1: Write the failing tests**

`src/server/movie-night-service.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { MovieCard } from './catalog-service.ts';
import { MovieNightError, MovieNightService, type MovieNightEvent } from './movie-night-service.ts';

const card = (id: string): MovieCard => ({ id, title: id.toUpperCase(), year: 2000, rating: 7 });
const DECK = [card('a'), card('b'), card('c')];
const host = { id: 'host-1', maxMaturityLevel: null };

/** A deterministic random source: cycles the given values. */
function seeded(values: number[]) { let i = 0; return () => values[i++ % values.length]; }

function build(deck = DECK, options: { random?: () => number; now?: () => number; ttlMs?: number } = {}) {
  const deckSource = vi.fn(async () => deck);
  const events: MovieNightEvent[] = [];
  const service = new MovieNightService(deckSource, options);
  service.onEvent((event) => events.push(event));
  return { service, deckSource, events };
}

describe('MovieNightService sessions', () => {
  it('creates a session with a shuffled deck built through the host view', async () => {
    const { service, deckSource } = build(DECK, { random: seeded([0.9, 0.1, 0.5]) });
    const created = await service.create(host, { genre: 'drama' });
    expect(created.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(created.deckSize).toBe(3);
    expect(deckSource).toHaveBeenCalledWith({ genre: 'drama' }, 'host-1', null);
    const ids = service.deck(created.code).map((c) => c.id);
    expect(ids.sort()).toEqual(['a', 'b', 'c']);
    // Same random source → same order: shuffling is deterministic under test.
    const again = await build(DECK, { random: seeded([0.9, 0.1, 0.5]) }).service.create(host, {});
    expect(service.deck(created.code).map((c) => c.id)).toEqual(await Promise.resolve(again).then(() => ids));
  });

  it('lets guests join with a unique nickname and announces them', async () => {
    const { service, events } = build();
    const { code } = await service.create(host, {});
    const ann = service.join(code, '  Ann ', '10.0.0.2');
    expect(ann.token).toHaveLength(64);
    expect(() => service.join(code, 'ann', '10.0.0.3')).toThrow(new MovieNightError('nickname_taken'));
    expect(() => service.join(code, '', '10.0.0.3')).toThrow(new MovieNightError('invalid_nickname'));
    expect(() => service.join('ZZZZ-ZZZZ', 'Bob', '10.0.0.3')).toThrow(new MovieNightError('not_found'));
    expect(events.at(-1)).toMatchObject({ code, audience: 'all', message: { type: 'participant.joined', participant: { id: ann.participantId, nickname: 'Ann' } } });
    expect(service.authenticateParticipant(code, ann.token)).toMatchObject({ id: ann.participantId, nickname: 'Ann' });
    expect(() => service.authenticateParticipant(code, 'nope')).toThrow(new MovieNightError('not_found'));
    expect(service.isHost(code, 'host-1')).toBe(true);
    expect(service.isHost(code, 'someone')).toBe(false);
  });

  it('caps a session at twenty participants and throttles one address', async () => {
    const { service } = build();
    const { code } = await service.create(host, {});
    for (let i = 0; i < 20; i++) service.join(code, `p${i}`, `10.0.1.${i}`);
    expect(() => service.join(code, 'late', '10.0.2.1')).toThrow(new MovieNightError('full'));
    const { service: other } = build();
    const second = await other.create(host, {});
    for (let i = 0; i < 30; i++) { try { other.join(second.code, `dup`, '10.0.3.1'); } catch { /* nickname clash after the first */ } }
    expect(() => other.join(second.code, 'fresh', '10.0.3.1')).toThrow(new MovieNightError('throttled'));
  });

  it('reports public state, with the caller own votes only', async () => {
    const { service } = build();
    const { code } = await service.create(host, {});
    const ann = service.join(code, 'Ann', '1');
    const state = service.state(code);
    expect(state).toEqual({ code, phase: 'lobby', deckSize: 3, participants: [{ id: ann.participantId, nickname: 'Ann', joinedAt: expect.any(Number) }], matches: [], dismissed: [], allDone: false });
    expect(service.state(code, ann.participantId)).toMatchObject({ participantId: ann.participantId, votes: {} });
    expect(() => service.state('ZZZZ-ZZZZ')).toThrow(new MovieNightError('not_found'));
  });

  it('accepts a code typed without its dash or in lower case', async () => {
    const { service } = build();
    const { code } = await service.create(host, {});
    expect(service.state(code.toLowerCase().replace('-', '')).code).toBe(code);
  });
});
```

Note: the first test's final assertion is convoluted; simplify it to build two services with identical seeds and compare `deck()` order directly:

```ts
    const twin = build(DECK, { random: seeded([0.9, 0.1, 0.5]) });
    const twinCode = (await twin.service.create(host, {})).code;
    expect(twin.service.deck(twinCode).map((c) => c.id)).toEqual(ids);
```
(Use this form; drop the `Promise.resolve(again)` line.)

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- src/server/movie-night-service.test.ts`
Expected: FAIL — cannot resolve `./movie-night-service.ts`.

- [ ] **Step 3: Implement**

`src/server/movie-night-service.ts`:

```ts
import { randomBytes } from 'node:crypto';
import type { MovieCard, MovieDeckFilters } from './catalog-service.ts';
import { createSessionToken, hashSessionToken } from './security.ts';

export type Vote = 'yes' | 'no' | 'maybe';
export type Phase = 'lobby' | 'swiping' | 'ended';

export interface Participant { id: string; nickname: string; joinedAt: number }
export interface LeaderEntry { card: MovieCard; yes: number; maybe: number }

export type MovieNightMessage =
  | { type: 'participant.joined'; participant: Participant }
  | { type: 'participant.left'; participantId: string }
  | { type: 'phase.changed'; phase: Phase }
  | { type: 'progress'; participantId: string; done: number; total: number }
  | { type: 'match'; card: MovieCard }
  | { type: 'match.dismissed'; cardId: string }
  | { type: 'leaders'; entries: LeaderEntry[] }
  | { type: 'ended' };

export interface MovieNightEvent { code: string; audience: 'all' | 'host'; message: MovieNightMessage }

export interface PublicState {
  code: string; phase: Phase; deckSize: number; participants: Participant[];
  matches: MovieCard[]; dismissed: string[]; allDone: boolean;
  votes?: Record<string, Vote>; participantId?: string;
}

export type MovieNightReason = 'not_found' | 'nickname_taken' | 'invalid_nickname' | 'full' | 'forbidden' | 'wrong_phase' | 'unknown_card' | 'throttled';
export class MovieNightError extends Error {
  constructor(readonly reason: MovieNightReason) { super(reason); this.name = 'MovieNightError'; }
}

/** Builds the deck through the host's catalog view so maturity limits apply. */
export type DeckSource = (filters: MovieDeckFilters, hostUserId: string, maturity: number | null) => Promise<MovieCard[]>;

interface StoredParticipant extends Participant { tokenHash: string }

interface Session {
  code: string;
  hostUserId: string;
  createdAt: number;
  lastActivityAt: number;
  phase: Phase;
  filters: MovieDeckFilters;
  deck: MovieCard[];
  participants: Map<string, StoredParticipant>;
  votes: Map<string, Map<string, Vote>>;
  matches: string[];
  dismissed: Set<string>;
}

export const MOVIE_NIGHT_TTL_MS = 6 * 60 * 60 * 1000;
export const MAX_PARTICIPANTS = 20;
export const NICKNAME_MAX = 24;
const JOIN_WINDOW_MS = 10 * 60 * 1000;
const JOINS_PER_ADDRESS = 30;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Accepts a code with or without its dash, in any case. */
export function normalizeCode(value: string): string {
  const bare = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return bare.length === 8 ? `${bare.slice(0, 4)}-${bare.slice(4)}` : bare;
}

export class MovieNightService {
  private readonly sessions = new Map<string, Session>();
  private readonly listeners = new Set<(event: MovieNightEvent) => void>();
  private readonly joinsByAddress = new Map<string, number[]>();
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly ttlMs: number;

  constructor(private readonly deckSource: DeckSource, options: { now?: () => number; random?: () => number; ttlMs?: number } = {}) {
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.ttlMs = options.ttlMs ?? MOVIE_NIGHT_TTL_MS;
  }

  onEvent(listener: (event: MovieNightEvent) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  protected emit(code: string, audience: 'all' | 'host', message: MovieNightMessage): void {
    for (const listener of [...this.listeners]) listener({ code, audience, message });
  }

  async create(host: { id: string; maxMaturityLevel: number | null }, filters: MovieDeckFilters): Promise<{ code: string; deckSize: number }> {
    this.sweep();
    const deck = this.shuffle(await this.deckSource(filters, host.id, host.maxMaturityLevel));
    const code = this.uniqueCode();
    const at = this.now();
    this.sessions.set(code, { code, hostUserId: host.id, createdAt: at, lastActivityAt: at, phase: 'lobby', filters, deck, participants: new Map(), votes: new Map(), matches: [], dismissed: new Set() });
    return { code, deckSize: deck.length };
  }

  join(code: string, nickname: string, address: string): { participantId: string; token: string } {
    this.throttleJoin(address);
    const session = this.get(code);
    const name = nickname.trim();
    if (name.length < 1 || name.length > NICKNAME_MAX) throw new MovieNightError('invalid_nickname');
    if (session.phase === 'ended') throw new MovieNightError('wrong_phase');
    if (session.participants.size >= MAX_PARTICIPANTS) throw new MovieNightError('full');
    for (const other of session.participants.values()) {
      if (other.nickname.toLowerCase() === name.toLowerCase()) throw new MovieNightError('nickname_taken');
    }
    const token = createSessionToken();
    const participant: StoredParticipant = { id: randomBytes(8).toString('hex'), nickname: name, joinedAt: this.now(), tokenHash: hashSessionToken(token) };
    session.participants.set(participant.id, participant);
    session.votes.set(participant.id, new Map());
    this.touch(session);
    this.emit(session.code, 'all', { type: 'participant.joined', participant: this.publicParticipant(participant) });
    return { participantId: participant.id, token };
  }

  authenticateParticipant(code: string, token: string): Participant {
    const session = this.get(code);
    const hash = hashSessionToken(token);
    for (const participant of session.participants.values()) {
      if (participant.tokenHash === hash) return this.publicParticipant(participant);
    }
    throw new MovieNightError('not_found');
  }

  isHost(code: string, userId: string): boolean {
    return this.get(code).hostUserId === userId;
  }

  state(code: string, participantId?: string): PublicState {
    const session = this.get(code);
    const state: PublicState = {
      code: session.code, phase: session.phase, deckSize: session.deck.length,
      participants: [...session.participants.values()].map((p) => this.publicParticipant(p)),
      matches: session.matches.map((id) => this.cardOf(session, id)),
      dismissed: [...session.dismissed],
      allDone: this.allDone(session),
    };
    if (participantId && session.participants.has(participantId)) {
      state.participantId = participantId;
      state.votes = Object.fromEntries(session.votes.get(participantId) ?? []);
    }
    return state;
  }

  deck(code: string): MovieCard[] {
    return [...this.get(code).deck];
  }

  // ---- internals shared with Task 3 ----

  protected get(code: string): Session {
    const session = this.sessions.get(normalizeCode(code));
    if (!session) throw new MovieNightError('not_found');
    return session;
  }

  protected touch(session: Session): void { session.lastActivityAt = this.now(); }

  protected cardOf(session: Session, id: string): MovieCard {
    const card = session.deck.find((c) => c.id === id);
    if (!card) throw new MovieNightError('unknown_card');
    return card;
  }

  protected allDone(session: Session): boolean {
    if (session.participants.size === 0 || session.phase !== 'swiping') return false;
    for (const id of session.participants.keys()) {
      if ((session.votes.get(id)?.size ?? 0) < session.deck.length) return false;
    }
    return true;
  }

  private publicParticipant(p: StoredParticipant): Participant {
    return { id: p.id, nickname: p.nickname, joinedAt: p.joinedAt };
  }

  private shuffle(cards: MovieCard[]): MovieCard[] {
    const out = [...cards];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  private uniqueCode(): string {
    for (;;) {
      const bytes = randomBytes(8);
      let raw = '';
      for (let i = 0; i < 8; i++) raw += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
      const code = `${raw.slice(0, 4)}-${raw.slice(4)}`;
      if (!this.sessions.has(code)) return code;
    }
  }

  private throttleJoin(address: string): void {
    const cutoff = this.now() - JOIN_WINDOW_MS;
    const recent = (this.joinsByAddress.get(address) ?? []).filter((at) => at > cutoff);
    if (recent.length >= JOINS_PER_ADDRESS) throw new MovieNightError('throttled');
    recent.push(this.now());
    this.joinsByAddress.set(address, recent);
  }

  /** Drop sessions idle past the TTL. Called on create and by the sweep timer. */
  sweep(): void {
    const cutoff = this.now() - this.ttlMs;
    for (const [code, session] of this.sessions) {
      if (session.lastActivityAt < cutoff) { this.sessions.delete(code); this.emit(code, 'all', { type: 'ended' }); }
    }
  }
}
```

- [ ] **Step 4: Run tests**

Run: `bun run test -- src/server/movie-night-service.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/movie-night-service.ts src/server/movie-night-service.test.ts
git commit -m "feat(movie-night): session service with joining and state"
```

---

### Task 3: MovieNightService — voting, matching, leaders, lifecycle

**Files:**
- Modify: `src/server/movie-night-service.ts`
- Test: `src/server/movie-night-service.test.ts` (append)

**Interfaces:**
- Produces:
  ```ts
  start(code: string, hostUserId: string): void                       // lobby → swiping, emits phase.changed
  vote(code: string, participantId: string, cardId: string, vote: Vote): void   // emits progress (all), leaders (host), maybe match
  undo(code: string, participantId: string, cardId: string): void
  leave(code: string, participantId: string): void                    // emits participant.left, re-checks match
  dismiss(code: string, hostUserId: string, cardId: string): void     // emits match.dismissed, re-checks
  end(code: string, hostUserId: string): void                         // emits ended, deletes session
  leaders(code: string): LeaderEntry[]                                // top 10
  ```

- [ ] **Step 1: Write the failing tests**

Append to `src/server/movie-night-service.test.ts`:

```ts
describe('MovieNightService voting and matching', () => {
  async function swipingSession() {
    const built = build();
    const { code } = await built.service.create(host, {});
    const ann = built.service.join(code, 'Ann', '1');
    const bob = built.service.join(code, 'Bob', '2');
    built.service.start(code, 'host-1');
    built.events.length = 0;
    return { ...built, code, ann: ann.participantId, bob: bob.participantId };
  }

  it('only the host may start, and only from the lobby', async () => {
    const { service } = build();
    const { code } = await service.create(host, {});
    expect(() => service.start(code, 'other')).toThrow(new MovieNightError('forbidden'));
    service.start(code, 'host-1');
    expect(service.state(code).phase).toBe('swiping');
    expect(() => service.start(code, 'host-1')).toThrow(new MovieNightError('wrong_phase'));
  });

  it('rejects votes before swiping starts and for unknown cards', async () => {
    const { service } = build();
    const { code } = await service.create(host, {});
    const ann = service.join(code, 'Ann', '1').participantId;
    expect(() => service.vote(code, ann, 'a', 'yes')).toThrow(new MovieNightError('wrong_phase'));
    service.start(code, 'host-1');
    expect(() => service.vote(code, ann, 'zzz', 'yes')).toThrow(new MovieNightError('unknown_card'));
  });

  it('announces a match when every participant said yes to the same card', async () => {
    const { service, events, code, ann, bob } = await swipingSession();
    service.vote(code, ann, 'a', 'yes');
    service.vote(code, ann, 'b', 'yes');
    service.vote(code, bob, 'a', 'no');
    expect(events.filter((e) => e.message.type === 'match')).toHaveLength(0);
    expect(events.find((e) => e.message.type === 'progress' && e.audience === 'all')?.message).toEqual({ type: 'progress', participantId: ann, done: 1, total: 3 });
    service.vote(code, bob, 'b', 'yes');
    const match = events.find((e) => e.message.type === 'match');
    expect(match).toMatchObject({ audience: 'all', message: { type: 'match', card: { id: 'b' } } });
    expect(service.state(code).matches.map((c) => c.id)).toEqual(['b']);
    // A re-vote overwrites; maybe never matches.
    service.vote(code, bob, 'c', 'maybe'); service.vote(code, ann, 'c', 'yes');
    expect(service.state(code).matches.map((c) => c.id)).toEqual(['b']);
  });

  it('a late joiner blocks a match and a leaver unblocks one', async () => {
    const { service, events, code, ann, bob } = await swipingSession();
    service.vote(code, ann, 'a', 'yes');
    const cat = service.join(code, 'Cat', '3').participantId;
    service.vote(code, bob, 'a', 'yes');
    expect(events.filter((e) => e.message.type === 'match')).toHaveLength(0);
    service.leave(code, cat);
    expect(events.at(-1)).toMatchObject({ message: { type: 'match', card: { id: 'a' } } });
    expect(events.some((e) => e.message.type === 'participant.left' && e.message.participantId === cat)).toBe(true);
  });

  it('dismissing a match lets the night find the next one', async () => {
    const { service, events, code, ann, bob } = await swipingSession();
    for (const id of ['a', 'b']) { service.vote(code, ann, id, 'yes'); service.vote(code, bob, id, 'yes'); }
    expect(service.state(code).matches.map((c) => c.id)).toEqual(['a']);
    expect(() => service.dismiss(code, 'other', 'a')).toThrow(new MovieNightError('forbidden'));
    service.dismiss(code, 'host-1', 'a');
    expect(events.at(-2)?.message).toEqual({ type: 'match.dismissed', cardId: 'a' });
    expect(events.at(-1)?.message).toMatchObject({ type: 'match', card: { id: 'b' } });
    expect(service.state(code)).toMatchObject({ matches: [{ id: 'a' }, { id: 'b' }], dismissed: ['a'] });
  });

  it('undo removes a vote and rolls progress back', async () => {
    const { service, events, code, ann } = await swipingSession();
    service.vote(code, ann, 'a', 'yes');
    service.undo(code, ann, 'a');
    expect(service.state(code, ann).votes).toEqual({});
    expect(events.at(-1)?.message).toMatchObject({ type: 'progress', participantId: ann, done: 0 });
  });

  it('ranks leaders by yes then maybe then deck order, for the host only', async () => {
    const { service, events, code, ann, bob } = await swipingSession();
    const order = service.deck(code).map((c) => c.id);
    service.vote(code, ann, 'c', 'yes'); service.vote(code, bob, 'c', 'maybe');
    service.vote(code, ann, 'a', 'maybe'); service.vote(code, bob, 'a', 'maybe');
    service.vote(code, ann, 'b', 'no'); service.vote(code, bob, 'b', 'no');
    expect(service.leaders(code).map((e) => [e.card.id, e.yes, e.maybe])).toEqual([['c', 1, 1], ['a', 0, 2], ['b', 0, 0]]);
    expect(order.indexOf('b')).toBeGreaterThanOrEqual(0);
    const leaderEvents = events.filter((e) => e.message.type === 'leaders');
    expect(leaderEvents.length).toBeGreaterThan(0);
    expect(leaderEvents.every((e) => e.audience === 'host')).toBe(true);
    expect(service.state(code).allDone).toBe(true);
  });

  it('ending removes the session and tells everyone', async () => {
    const { service, events, code } = await swipingSession();
    expect(() => service.end(code, 'other')).toThrow(new MovieNightError('forbidden'));
    service.end(code, 'host-1');
    expect(events.at(-1)).toEqual({ code, audience: 'all', message: { type: 'ended' } });
    expect(() => service.state(code)).toThrow(new MovieNightError('not_found'));
  });

  it('sweeps sessions idle past the TTL', async () => {
    let clock = 1_000;
    const { service, events } = build(DECK, { now: () => clock, ttlMs: 100 });
    const { code } = await service.create(host, {});
    clock += 50; service.sweep();
    expect(service.state(code).phase).toBe('lobby');
    clock += 100; service.sweep();
    expect(() => service.state(code)).toThrow(new MovieNightError('not_found'));
    expect(events.at(-1)).toEqual({ code, audience: 'all', message: { type: 'ended' } });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun run test -- src/server/movie-night-service.test.ts`
Expected: FAIL — `service.start is not a function` etc.

- [ ] **Step 3: Implement**

Add to the class in `src/server/movie-night-service.ts` (before the `// ---- internals` block):

```ts
  start(code: string, hostUserId: string): void {
    const session = this.requireHost(code, hostUserId);
    if (session.phase !== 'lobby') throw new MovieNightError('wrong_phase');
    session.phase = 'swiping';
    this.touch(session);
    this.emit(session.code, 'all', { type: 'phase.changed', phase: 'swiping' });
  }

  vote(code: string, participantId: string, cardId: string, vote: Vote): void {
    const session = this.get(code);
    if (session.phase !== 'swiping') throw new MovieNightError('wrong_phase');
    const votes = session.votes.get(participantId);
    if (!votes) throw new MovieNightError('not_found');
    this.cardOf(session, cardId);
    votes.set(cardId, vote);
    this.afterVoteChange(session, participantId);
  }

  undo(code: string, participantId: string, cardId: string): void {
    const session = this.get(code);
    if (session.phase !== 'swiping') throw new MovieNightError('wrong_phase');
    const votes = session.votes.get(participantId);
    if (!votes) throw new MovieNightError('not_found');
    votes.delete(cardId);
    this.afterVoteChange(session, participantId);
  }

  leave(code: string, participantId: string): void {
    const session = this.get(code);
    if (!session.participants.delete(participantId)) throw new MovieNightError('not_found');
    session.votes.delete(participantId);
    this.touch(session);
    this.emit(session.code, 'all', { type: 'participant.left', participantId });
    this.checkMatch(session);
    this.emit(session.code, 'host', { type: 'leaders', entries: this.leaders(session.code) });
  }

  dismiss(code: string, hostUserId: string, cardId: string): void {
    const session = this.requireHost(code, hostUserId);
    if (!session.matches.includes(cardId)) throw new MovieNightError('unknown_card');
    session.dismissed.add(cardId);
    this.touch(session);
    this.emit(session.code, 'all', { type: 'match.dismissed', cardId });
    this.checkMatch(session);
  }

  end(code: string, hostUserId: string): void {
    const session = this.requireHost(code, hostUserId);
    session.phase = 'ended';
    this.sessions.delete(session.code);
    this.emit(session.code, 'all', { type: 'ended' });
  }

  /** Fallback ranking: yes desc, maybe desc, then deck order. Top ten. */
  leaders(code: string): LeaderEntry[] {
    const session = this.get(code);
    const tally = new Map<string, { yes: number; maybe: number }>();
    for (const votes of session.votes.values()) {
      for (const [cardId, vote] of votes) {
        const entry = tally.get(cardId) ?? { yes: 0, maybe: 0 };
        if (vote === 'yes') entry.yes += 1; else if (vote === 'maybe') entry.maybe += 1;
        tally.set(cardId, entry);
      }
    }
    return session.deck
      .map((card, index) => ({ card, index, ...(tally.get(card.id) ?? { yes: 0, maybe: 0 }) }))
      .sort((a, b) => b.yes - a.yes || b.maybe - a.maybe || a.index - b.index)
      .slice(0, 10)
      .map(({ card, yes, maybe }) => ({ card, yes, maybe }));
  }

  private requireHost(code: string, hostUserId: string): Session {
    const session = this.get(code);
    if (session.hostUserId !== hostUserId) throw new MovieNightError('forbidden');
    return session;
  }

  private afterVoteChange(session: Session, participantId: string): void {
    this.touch(session);
    this.emit(session.code, 'all', { type: 'progress', participantId, done: session.votes.get(participantId)?.size ?? 0, total: session.deck.length });
    this.checkMatch(session);
    this.emit(session.code, 'host', { type: 'leaders', entries: this.leaders(session.code) });
  }

  /** First card in deck order every current participant said yes to, not yet announced or dismissed. */
  private checkMatch(session: Session): void {
    if (session.phase !== 'swiping' || session.participants.size === 0) return;
    const active = session.matches.some((id) => !session.dismissed.has(id));
    if (active) return;
    for (const card of session.deck) {
      if (session.matches.includes(card.id) || session.dismissed.has(card.id)) continue;
      let unanimous = true;
      for (const id of session.participants.keys()) {
        if (session.votes.get(id)?.get(card.id) !== 'yes') { unanimous = false; break; }
      }
      if (unanimous) {
        session.matches.push(card.id);
        this.emit(session.code, 'all', { type: 'match', card });
        return;
      }
    }
  }
```

Note the `active` guard: while one match is on screen (not dismissed) no further match is announced. This keeps "Keep swiping" meaningful.

- [ ] **Step 4: Run tests**

Run: `bun run test -- src/server/movie-night-service.test.ts`
Expected: PASS (14 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/movie-night-service.ts src/server/movie-night-service.test.ts
git commit -m "feat(movie-night): voting, match detection, leaders, lifecycle"
```

---

### Task 4: MovieNightHub — sockets per session

**Files:**
- Create: `src/server/movie-night-hub.ts`
- Test: `src/server/movie-night-hub.test.ts`

**Interfaces:**
- Consumes: `RealtimeSocket` from `./realtime.ts`; `MovieNightEvent`, `MovieNightService.onEvent`.
- Produces:
  ```ts
  export class MovieNightHub {
    constructor(service: Pick<MovieNightService, 'onEvent'>);
    add(code: string, socket: RealtimeSocket, role: 'host' | 'participant'): void;
    connections(code: string): number;
    closeAll(): void;
  }
  ```
  Frames are `JSON.stringify(message)` — the bare `MovieNightMessage`, no envelope. `leaders` goes to `host` sockets only; `ended` also closes every socket of that session with code `4000`.

- [ ] **Step 1: Write the failing test**

`src/server/movie-night-hub.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { MovieNightHub } from './movie-night-hub.ts';
import type { MovieNightEvent } from './movie-night-service.ts';
import type { RealtimeSocket } from './realtime.ts';

function fakeSocket(readyState = 1) {
  const listeners = new Map<string, () => void>();
  return {
    readyState, sent: [] as string[],
    send(data: string) { this.sent.push(data); },
    close: vi.fn(),
    on(event: string, listener: () => void) { listeners.set(event, listener); },
    emit(event: string) { listeners.get(event)?.(); },
  };
}

function hubWithEmitter() {
  let listener: ((event: MovieNightEvent) => void) | undefined;
  const hub = new MovieNightHub({ onEvent: (next) => { listener = next; return () => { listener = undefined; }; } });
  return { hub, emit: (event: MovieNightEvent) => listener?.(event) };
}

describe('MovieNightHub', () => {
  it('routes events to the sockets of one session, host-only frames to the host', () => {
    const { hub, emit } = hubWithEmitter();
    const tv = fakeSocket(); const phone = fakeSocket(); const otherNight = fakeSocket();
    hub.add('AAAA-AAAA', tv as unknown as RealtimeSocket, 'host');
    hub.add('AAAA-AAAA', phone as unknown as RealtimeSocket, 'participant');
    hub.add('BBBB-BBBB', otherNight as unknown as RealtimeSocket, 'host');

    emit({ code: 'AAAA-AAAA', audience: 'all', message: { type: 'phase.changed', phase: 'swiping' } });
    emit({ code: 'AAAA-AAAA', audience: 'host', message: { type: 'leaders', entries: [] } });

    expect(tv.sent.map((f) => JSON.parse(f).type)).toEqual(['phase.changed', 'leaders']);
    expect(phone.sent.map((f) => JSON.parse(f).type)).toEqual(['phase.changed']);
    expect(otherNight.sent).toHaveLength(0);
    expect(hub.connections('AAAA-AAAA')).toBe(2);
  });

  it('drops closed or throwing sockets and closes everyone when a night ends', () => {
    const { hub, emit } = hubWithEmitter();
    const healthy = fakeSocket(); const gone = fakeSocket(); const broken = fakeSocket();
    broken.send = () => { throw new Error('gone'); };
    for (const s of [healthy, gone, broken]) hub.add('AAAA-AAAA', s as unknown as RealtimeSocket, 'participant');
    gone.emit('close');
    emit({ code: 'AAAA-AAAA', audience: 'all', message: { type: 'progress', participantId: 'p', done: 1, total: 3 } });
    expect(hub.connections('AAAA-AAAA')).toBe(1);

    emit({ code: 'AAAA-AAAA', audience: 'all', message: { type: 'ended' } });
    expect(JSON.parse(healthy.sent.at(-1)!)).toEqual({ type: 'ended' });
    expect(healthy.close).toHaveBeenCalledWith(4000, 'Movie night ended');
    expect(hub.connections('AAAA-AAAA')).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun run test -- src/server/movie-night-hub.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/server/movie-night-hub.ts`:

```ts
import type { MovieNightEvent, MovieNightService } from './movie-night-service.ts';
import type { RealtimeSocket } from './realtime.ts';

const OPEN = 1;

interface Member { socket: RealtimeSocket; role: 'host' | 'participant' }

/**
 * Fans movie-night events out to the sockets of one session. Frames are the
 * bare message; `host` audience frames reach only the TV so phones never see
 * aggregate votes.
 */
export class MovieNightHub {
  private readonly rooms = new Map<string, Set<Member>>();
  private readonly unsubscribe: () => void;

  constructor(service: Pick<MovieNightService, 'onEvent'>) {
    this.unsubscribe = service.onEvent((event) => this.dispatch(event));
  }

  add(code: string, socket: RealtimeSocket, role: 'host' | 'participant'): void {
    const room = this.rooms.get(code) ?? new Set<Member>();
    this.rooms.set(code, room);
    const member: Member = { socket, role };
    room.add(member);
    const drop = () => { room.delete(member); if (room.size === 0) this.rooms.delete(code); };
    socket.on('close', drop);
    socket.on('error', drop);
  }

  connections(code: string): number { return this.rooms.get(code)?.size ?? 0; }

  private dispatch(event: MovieNightEvent): void {
    const room = this.rooms.get(event.code);
    if (!room) return;
    const data = JSON.stringify(event.message);
    for (const member of [...room]) {
      if (event.audience === 'host' && member.role !== 'host') continue;
      try { if (member.socket.readyState === OPEN) member.socket.send(data); else room.delete(member); }
      catch { room.delete(member); }
    }
    if (event.message.type === 'ended') {
      for (const member of room) { try { member.socket.close(4000, 'Movie night ended'); } catch { /* gone */ } }
      this.rooms.delete(event.code);
    }
  }

  closeAll(): void {
    this.unsubscribe();
    for (const room of this.rooms.values()) {
      for (const member of room) { try { member.socket.close(1001, 'Server shutting down'); } catch { /* gone */ } }
    }
    this.rooms.clear();
  }
}
```

- [ ] **Step 4: Run tests**

Run: `bun run test -- src/server/movie-night-hub.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/movie-night-hub.ts src/server/movie-night-hub.test.ts
git commit -m "feat(movie-night): per-session socket hub"
```

---

### Task 5: HTTP routes

**Files:**
- Create: `src/server/movie-night-routes.ts`
- Test: `src/server/movie-night-routes.test.ts`

**Interfaces:**
- Consumes: `AuthService.authenticate(cookie)`, `CatalogService.forViewer().listMovieCards/countMovieCards`, `MovieNightService`, `MovieNightHub`, `SESSION_COOKIE` from `./security.ts`.
- Produces:
  ```ts
  export function registerMovieNightRoutes(app: FastifyInstance, auth: AuthService, catalog: CatalogService, service: MovieNightService, hub: MovieNightHub, sessionCookie?: string): void
  ```
  Response shapes:
  - `POST /api/v1/movie-night` → `{ code, joinPath: '/movie-night/join?code=XXXX-XXXX', deckSize }`
  - `GET /api/v1/movie-night/count?…filters` → `{ count }`
  - `GET /api/v1/movie-night/:code` → `{ state: PublicState, role: 'host' | 'participant' }`
  - `POST /:code/join` `{ nickname }` → `{ participantId, token }`
  - `GET /:code/deck` → `{ cards: MovieCard[] }`
  - `PUT /:code/votes/:cardId` `{ vote }` → `{ ok: true }`; `DELETE` same
  - `DELETE /:code/participants/:id` → `{ ok: true }`
  - `POST /:code/start|end`, `POST /:code/dismiss/:cardId` → `{ ok: true }`
  - `GET /:code/leaders` → `{ entries }`
  - Errors: `MovieNightError` reason → status: `not_found` 404, `nickname_taken` 409, `invalid_nickname` 400, `full` 409, `forbidden` 403, `wrong_phase` 409, `unknown_card` 404, `throttled` 429. Body `{ error, reason }`.

- [ ] **Step 1: Write the failing tests**

`src/server/movie-night-routes.test.ts`:

```ts
import cookie from '@fastify/cookie';
import websocket from '@fastify/websocket';
import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthService } from './auth-service.ts';
import type { CatalogService, MovieCard } from './catalog-service.ts';
import { MovieNightHub } from './movie-night-hub.ts';
import { registerMovieNightRoutes } from './movie-night-routes.ts';
import { MovieNightService } from './movie-night-service.ts';

const DECK: MovieCard[] = [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }];
const HOST = { id: 'host-1', username: 'owner', role: 'admin', maxMaturityLevel: null };

async function appWith() {
  const auth = { authenticate: vi.fn(async (token?: string) => (token === 'host' ? HOST : null)) } as unknown as AuthService;
  const listMovieCards = vi.fn(async () => DECK);
  const countMovieCards = vi.fn(async () => 2);
  const forViewer = vi.fn(() => ({ listMovieCards, countMovieCards }));
  const catalog = { forViewer } as unknown as CatalogService;
  const service = new MovieNightService(async (filters, hostId, maturity) => catalog.forViewer(maturity).listMovieCards(filters, hostId));
  const hub = new MovieNightHub(service);
  const app = Fastify(); await app.register(cookie); await app.register(websocket);
  registerMovieNightRoutes(app, auth, catalog, service, hub);
  return { app, service, listMovieCards, countMovieCards, forViewer };
}

const hostHeaders = { cookie: 'dose_session=host' };
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
    expect((await app.inject({ method: 'POST', url: `/api/v1/movie-night/${code}/start`, headers: bearer(ann.token) })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: `/api/v1/movie-night/${code}/start`, headers: hostHeaders })).statusCode).toBe(200);
    expect((await app.inject({ method: 'PUT', url: `/api/v1/movie-night/${code}/votes/a`, headers: bearer(ann.token), payload: { vote: 'yes' } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'PUT', url: `/api/v1/movie-night/${code}/votes/a`, headers: bearer(ann.token), payload: { vote: 'later' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PUT', url: `/api/v1/movie-night/${code}/votes/zzz`, headers: bearer(ann.token), payload: { vote: 'yes' } })).statusCode).toBe(404);
    const state = (await app.inject({ method: 'GET', url: `/api/v1/movie-night/${code}`, headers: hostHeaders })).json().state;
    expect(state.matches.map((c: MovieCard) => c.id)).toEqual(['a']);
    expect((await app.inject({ method: 'GET', url: `/api/v1/movie-night/${code}/leaders`, headers: bearer(ann.token) })).statusCode).toBe(403);
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
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun run test -- src/server/movie-night-routes.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/server/movie-night-routes.ts`:

```ts
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
```

Note the `start`/`end` handlers throw `forbidden` (403) for an unauthenticated caller as the test expects for a bearer-only caller; a bare request with neither also gets 403, which is fine.

- [ ] **Step 4: Run tests**

Run: `bun run test -- src/server/movie-night-routes.test.ts`
Expected: PASS (4 tests). Also run `bunx tsc -p tsconfig.server.json --noEmit` and fix any type errors (e.g. `PublicUser` export name — confirm in `auth-service.ts:8`).

- [ ] **Step 5: Commit**

```bash
git add src/server/movie-night-routes.ts src/server/movie-night-routes.test.ts
git commit -m "feat(movie-night): HTTP and socket routes"
```

---

### Task 6: Socket route test + app wiring

**Files:**
- Modify: `src/server/movie-night-routes.test.ts` (append)
- Modify: `src/server/app.ts` (around lines 100–140)

- [ ] **Step 1: Write the failing socket test**

Append to `src/server/movie-night-routes.test.ts`:

```ts
import WebSocketClient from 'ws';

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
      await vi.waitFor(() => expect(built.service).toBeDefined());

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
```

Move the `import WebSocketClient from 'ws'` line up with the other imports at the top of the file.

- [ ] **Step 2: Run the test**

Run: `bun run test -- src/server/movie-night-routes.test.ts -t socket`
Expected: PASS (the route already exists from Task 5). If it fails, fix the socket handler until it passes.

- [ ] **Step 3: Wire into app.ts**

In `src/server/app.ts`, add imports:

```ts
import { MovieNightHub } from './movie-night-hub.ts';
import { registerMovieNightRoutes } from './movie-night-routes.ts';
import { MovieNightService } from './movie-night-service.ts';
```

After `registerRealtimeRoute(app, auth, realtime);` add:

```ts
  const catalog = new CatalogService(database, join(config.CONFIG_PATH, 'trailers'), pluginEvents);
  const movieNight = new MovieNightService(async (filters, hostId, maturity) => catalog.forViewer(maturity).listMovieCards(filters, hostId));
  const movieNightHub = new MovieNightHub(movieNight);
  const movieNightSweep = setInterval(() => movieNight.sweep(), 15 * 60 * 1000);
  registerMovieNightRoutes(app, auth, catalog, movieNight, movieNightHub);
```

Replace the inline `new CatalogService(database, join(config.CONFIG_PATH, 'trailers'), pluginEvents)` argument in the `registerApiRoutes(...)` call with `catalog`. In the `onClose` hook add `clearInterval(movieNightSweep); movieNightHub.closeAll();` before `realtime.closeAll();`.

- [ ] **Step 4: Verify**

Run: `bun run test -- src/server/app.test.ts src/server/movie-night-routes.test.ts` and `bunx tsc -p tsconfig.server.json --noEmit`.
Expected: all PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/server/app.ts src/server/movie-night-routes.test.ts
git commit -m "feat(movie-night): wire service, hub and routes into the app"
```

---

### Task 7: Client API + socket hook

**Files:**
- Modify: `src/lib/api.ts` (types near line 204, calls inside `api` object)
- Create: `src/lib/movie-night.ts`
- Test: `src/lib/movie-night.test.ts`

**Interfaces:**
- Produces in `api.ts`:
  ```ts
  export type MovieNightVote = 'yes' | 'no' | 'maybe';
  export type MovieNightPhase = 'lobby' | 'swiping' | 'ended';
  export interface MovieNightFilters { genre?: string; yearMin?: number; yearMax?: number; ratingMin?: number; unwatchedOnly?: boolean }
  export interface MovieNightCard { id: string; title: string; year?: number; posterUrl?: string; rating?: number; overview?: string; runtimeMinutes?: number }
  export interface MovieNightParticipant { id: string; nickname: string; joinedAt: number }
  export interface MovieNightLeader { card: MovieNightCard; yes: number; maybe: number }
  export interface MovieNightState { code: string; phase: MovieNightPhase; deckSize: number; participants: MovieNightParticipant[]; matches: MovieNightCard[]; dismissed: string[]; allDone: boolean; votes?: Record<string, MovieNightVote>; participantId?: string }
  export type MovieNightMessage = /* same union as server, using the client types above */;
  api.movieNight = {
    create(filters): Promise<{ code; joinPath; deckSize }>,
    count(filters): Promise<{ count }>,
    state(code, token?): Promise<{ role: 'host'|'participant'; state: MovieNightState }>,
    join(code, nickname): Promise<{ participantId; token }>,
    deck(code, token): Promise<{ cards: MovieNightCard[] }>,
    vote(code, token, cardId, vote): Promise<{ ok: true }>,
    undo(code, token, cardId): Promise<{ ok: true }>,
    leave(code, participantId, token?): Promise<{ ok: true }>,
    start(code), dismiss(code, cardId), end(code): Promise<{ ok: true }>,
    leaders(code): Promise<{ entries: MovieNightLeader[] }>,
  }
  ```
- Produces in `movie-night.ts`:
  ```ts
  export function loadParticipant(code): { participantId: string; token: string } | undefined   // localStorage `dose.movieNight.<CODE>`
  export function saveParticipant(code, value): void; export function clearParticipant(code): void
  export function socketUrl(code, token?): string
  export function useMovieNightSocket(code: string | undefined, token: string | undefined, onMessage: (m: MovieNightMessage) => void, onClose?: (code: number) => void): void
  ```
  The hook keeps the latest `onMessage` in a ref, reconnects with backoff 1s→2s→…→30s on non-4xxx closes, and does not reconnect after close codes 4000/4401/4404 (calls `onClose`).

- [ ] **Step 1: Write the failing tests**

`src/lib/movie-night.test.ts`:

```ts
import { renderHook, act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { clearParticipant, loadParticipant, saveParticipant, socketUrl, useMovieNightSocket } from './movie-night';

class FakeSocket {
  static instances: FakeSocket[] = [];
  onopen: (() => void) | null = null; onmessage: ((e: { data: string }) => void) | null = null; onclose: ((e: { code: number }) => void) | null = null;
  closed = false;
  constructor(readonly url: string) { FakeSocket.instances.push(this); }
  close() { this.closed = true; }
}

afterEach(() => { FakeSocket.instances = []; vi.unstubAllGlobals(); vi.useRealTimers(); localStorage.clear(); });

describe('participant storage', () => {
  it('round-trips per code and normalizes the key', () => {
    saveParticipant('abcd-efgh', { participantId: 'p1', token: 't' });
    expect(loadParticipant('ABCD-EFGH')).toEqual({ participantId: 'p1', token: 't' });
    clearParticipant('ABCD-EFGH');
    expect(loadParticipant('ABCD-EFGH')).toBeUndefined();
  });
});

describe('api.movieNight', () => {
  it('sends the participant token as a bearer header', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await api.movieNight.vote('AAAA-BBBB', 'tok', 'card', 'yes');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/movie-night/AAAA-BBBB/votes/card');
    expect(init.method).toBe('PUT');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(init.body).toBe(JSON.stringify({ vote: 'yes' }));
  });
});

describe('useMovieNightSocket', () => {
  it('connects with the token, forwards frames, and stops after a terminal close', () => {
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', FakeSocket);
    const onMessage = vi.fn(); const onClose = vi.fn();
    renderHook(() => useMovieNightSocket('AAAA-BBBB', 'tok', onMessage, onClose));
    expect(FakeSocket.instances).toHaveLength(1);
    expect(FakeSocket.instances[0].url).toBe(socketUrl('AAAA-BBBB', 'tok'));
    act(() => { FakeSocket.instances[0].onopen?.(); FakeSocket.instances[0].onmessage?.({ data: JSON.stringify({ type: 'ended' }) }); });
    expect(onMessage).toHaveBeenCalledWith({ type: 'ended' });
    act(() => { FakeSocket.instances[0].onclose?.({ code: 4000 }); });
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(FakeSocket.instances).toHaveLength(1);
    expect(onClose).toHaveBeenCalledWith(4000);
  });

  it('reconnects with backoff after a network close', () => {
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', FakeSocket);
    renderHook(() => useMovieNightSocket('AAAA-BBBB', undefined, vi.fn()));
    act(() => { FakeSocket.instances[0].onclose?.({ code: 1006 }); });
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(FakeSocket.instances).toHaveLength(2);
    act(() => { FakeSocket.instances[1].onclose?.({ code: 1006 }); vi.advanceTimersByTime(1_000); });
    expect(FakeSocket.instances).toHaveLength(2);
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(FakeSocket.instances).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun run test -- src/lib/movie-night.test.ts`
Expected: FAIL — module not found / `api.movieNight` undefined.

- [ ] **Step 3: Implement api.ts additions**

Add the types after `RandomItemFilters` (line ~204):

```ts
export type MovieNightVote = 'yes' | 'no' | 'maybe';
export type MovieNightPhase = 'lobby' | 'swiping' | 'ended';
export interface MovieNightFilters { genre?: string; yearMin?: number; yearMax?: number; ratingMin?: number; unwatchedOnly?: boolean }
export interface MovieNightCard { id: string; title: string; year?: number; posterUrl?: string; rating?: number; overview?: string; runtimeMinutes?: number }
export interface MovieNightParticipant { id: string; nickname: string; joinedAt: number }
export interface MovieNightLeader { card: MovieNightCard; yes: number; maybe: number }
export interface MovieNightState {
  code: string; phase: MovieNightPhase; deckSize: number; participants: MovieNightParticipant[];
  matches: MovieNightCard[]; dismissed: string[]; allDone: boolean;
  votes?: Record<string, MovieNightVote>; participantId?: string;
}
export type MovieNightMessage =
  | { type: 'participant.joined'; participant: MovieNightParticipant }
  | { type: 'participant.left'; participantId: string }
  | { type: 'phase.changed'; phase: MovieNightPhase }
  | { type: 'progress'; participantId: string; done: number; total: number }
  | { type: 'match'; card: MovieNightCard }
  | { type: 'match.dismissed'; cardId: string }
  | { type: 'leaders'; entries: MovieNightLeader[] }
  | { type: 'ended' };
```

Inside the `api` object add:

```ts
  movieNight: {
    create: (filters: MovieNightFilters) => request<{ code: string; joinPath: string; deckSize: number }>('/api/v1/movie-night', { method: 'POST', body: JSON.stringify(filters) }),
    count: (filters: MovieNightFilters) => {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) if (value != null && value !== '' && value !== false) query.set(key, String(value));
      const suffix = query.toString();
      return request<{ count: number }>(`/api/v1/movie-night/count${suffix ? `?${suffix}` : ''}`);
    },
    state: (code: string, token?: string) => request<{ role: 'host' | 'participant'; state: MovieNightState }>(`/api/v1/movie-night/${encodeURIComponent(code)}`, { headers: bearer(token) }),
    join: (code: string, nickname: string) => request<{ participantId: string; token: string }>(`/api/v1/movie-night/${encodeURIComponent(code)}/join`, { method: 'POST', body: JSON.stringify({ nickname }) }),
    deck: (code: string, token: string) => request<{ cards: MovieNightCard[] }>(`/api/v1/movie-night/${encodeURIComponent(code)}/deck`, { headers: bearer(token) }),
    vote: (code: string, token: string, cardId: string, vote: MovieNightVote) => request<{ ok: true }>(`/api/v1/movie-night/${encodeURIComponent(code)}/votes/${encodeURIComponent(cardId)}`, { method: 'PUT', headers: bearer(token), body: JSON.stringify({ vote }) }),
    undo: (code: string, token: string, cardId: string) => request<{ ok: true }>(`/api/v1/movie-night/${encodeURIComponent(code)}/votes/${encodeURIComponent(cardId)}`, { method: 'DELETE', headers: bearer(token) }),
    leave: (code: string, participantId: string, token?: string) => request<{ ok: true }>(`/api/v1/movie-night/${encodeURIComponent(code)}/participants/${encodeURIComponent(participantId)}`, { method: 'DELETE', headers: bearer(token) }),
    start: (code: string) => request<{ ok: true }>(`/api/v1/movie-night/${encodeURIComponent(code)}/start`, { method: 'POST' }),
    dismiss: (code: string, cardId: string) => request<{ ok: true }>(`/api/v1/movie-night/${encodeURIComponent(code)}/dismiss/${encodeURIComponent(cardId)}`, { method: 'POST' }),
    end: (code: string) => request<{ ok: true }>(`/api/v1/movie-night/${encodeURIComponent(code)}/end`, { method: 'POST' }),
    leaders: (code: string) => request<{ entries: MovieNightLeader[] }>(`/api/v1/movie-night/${encodeURIComponent(code)}/leaders`),
  },
```

And above the `api` object:

```ts
function bearer(token?: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}
```

- [ ] **Step 4: Implement `src/lib/movie-night.ts`**

```ts
import { useEffect, useRef } from 'react';
import type { MovieNightMessage } from '@/lib/api';

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
  handlers.current = { onMessage, onClose, onOpen };

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
```

- [ ] **Step 5: Run tests**

Run: `bun run test -- src/lib/movie-night.test.ts src/lib/api.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/api.ts src/lib/movie-night.ts src/lib/movie-night.test.ts
git commit -m "feat(movie-night): client API and socket hook"
```

---

### Task 8: MovieCardFace + SwipeCard

**Files:**
- Create: `src/components/movie-night/MovieCardFace.tsx`
- Create: `src/components/movie-night/SwipeCard.tsx`
- Test: `src/components/movie-night/SwipeCard.test.tsx`

**Interfaces:**
- Produces:
  ```tsx
  export function MovieCardFace({ card, expanded, onToggleExpand }: { card: MovieNightCard; expanded?: boolean; onToggleExpand?: () => void })
  export type SwipeDirection = 'left' | 'right' | 'up';
  export interface SwipeCardHandle { fly(direction: SwipeDirection): void }
  export const SwipeCard = forwardRef<SwipeCardHandle, { card: MovieNightCard; onSwipe: (direction: SwipeDirection) => void; interactive?: boolean; depth?: 0 | 1 | 2; entering?: SwipeDirection }>
  ```
  `depth` positions cards behind the top one. `entering` plays the undo return animation from that side. `onSwipe` fires after the fly-out animation ends (`transitionend`, or immediately with reduced motion).

- [ ] **Step 1: Write the failing test**

`src/components/movie-night/SwipeCard.test.tsx`:

```tsx
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SwipeCard, type SwipeCardHandle } from './SwipeCard';

const card = { id: 'a', title: 'Alpha', year: 2001, rating: 8.1, overview: 'First film', runtimeMinutes: 90, posterUrl: '/api/v1/images/a.jpg' };

function drag(el: HTMLElement, dx: number, steps = 3) {
  fireEvent.pointerDown(el, { pointerId: 1, clientX: 200, clientY: 300, isPrimary: true });
  for (let i = 1; i <= steps; i++) fireEvent.pointerMove(el, { pointerId: 1, clientX: 200 + (dx * i) / steps, clientY: 300 });
}

describe('SwipeCard', () => {
  beforeAll(() => {
    // jsdom has no layout; give the card a width so thresholds are computable.
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 300 });
    HTMLElement.prototype.setPointerCapture = vi.fn();
    HTMLElement.prototype.releasePointerCapture = vi.fn();
  });

  it('shows the title, meta line and rating', () => {
    render(<SwipeCard card={card} onSwipe={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Alpha' })).toBeInTheDocument();
    expect(screen.getByText(/2001/)).toBeInTheDocument();
    expect(screen.getByText(/8\.1/)).toBeInTheDocument();
    expect(screen.getByText(/1h 30m/)).toBeInTheDocument();
  });

  it('rotates with the drag and springs back below the threshold', () => {
    const onSwipe = vi.fn();
    render(<SwipeCard card={card} onSwipe={onSwipe} />);
    const el = screen.getByTestId('swipe-card');
    drag(el, 60);
    expect(el.style.transform).toMatch(/translate3d\(60px, 0px, 0\) rotate\(4\.8deg\)/);
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 260, clientY: 300 });
    expect(el.style.transform).toMatch(/translate3d\(0px, 0px, 0\) rotate\(0deg\)/);
    expect(onSwipe).not.toHaveBeenCalled();
  });

  it('flies out past the threshold and reports the direction after the transition', () => {
    const onSwipe = vi.fn();
    render(<SwipeCard card={card} onSwipe={onSwipe} />);
    const el = screen.getByTestId('swipe-card');
    drag(el, -150);
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 50, clientY: 300 });
    expect(el.style.transform).toMatch(/translate3d\(-\d+px/);
    expect(el.dataset.leaving).toBe('left');
    expect(onSwipe).not.toHaveBeenCalled();
    fireEvent.transitionEnd(el);
    expect(onSwipe).toHaveBeenCalledWith('left');
  });

  it('caps the rotation and shows the stamp', () => {
    render(<SwipeCard card={card} onSwipe={vi.fn()} />);
    const el = screen.getByTestId('swipe-card');
    drag(el, 400);
    expect(el.style.transform).toMatch(/rotate\(18deg\)/);
    expect(screen.getByText('YES')).toBeVisible();
  });

  it('can be flown programmatically through the handle', () => {
    const onSwipe = vi.fn();
    const ref = createRef<SwipeCardHandle>();
    render(<SwipeCard ref={ref} card={card} onSwipe={onSwipe} />);
    act(() => ref.current?.fly('up'));
    const el = screen.getByTestId('swipe-card');
    expect(el.dataset.leaving).toBe('up');
    fireEvent.transitionEnd(el);
    expect(onSwipe).toHaveBeenCalledWith('up');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun run test -- src/components/movie-night/SwipeCard.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `MovieCardFace.tsx`**

```tsx
import { Star } from 'lucide-react';
import type { MovieNightCard } from '@/lib/api';
import { cn } from '@/lib/utils';

export function formatRuntime(minutes?: number): string | undefined {
  if (!minutes) return undefined;
  const h = Math.floor(minutes / 60); const m = minutes % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

/** Poster-first face shared by the swipe deck, the match screens and the leaders grid. */
export function MovieCardFace({ card, expanded = false, onToggleExpand }: { card: MovieNightCard; expanded?: boolean; onToggleExpand?: () => void }) {
  const meta = [card.year, card.rating != null ? `★ ${card.rating.toFixed(1)}` : undefined, formatRuntime(card.runtimeMinutes)].filter(Boolean).join(' · ');
  return (
    <div className="relative h-full w-full overflow-hidden rounded-3xl bg-neutral-900 text-white shadow-2xl">
      {card.posterUrl
        ? <img src={card.posterUrl} alt="" draggable={false} className="absolute inset-0 h-full w-full select-none object-cover" />
        : <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-neutral-800 to-neutral-950 text-6xl font-black opacity-30">{card.title.slice(0, 1)}</div>}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/80 to-transparent px-5 pb-5 pt-24">
        <h2 className="text-2xl font-bold leading-tight drop-shadow">{card.title}</h2>
        {meta && <p className="mt-1 flex items-center gap-1 text-sm text-white/80"><Star className="h-3.5 w-3.5 fill-current text-amber-400" aria-hidden="true" />{meta}</p>}
        {card.overview && (
          <p onClick={onToggleExpand} className={cn('mt-2 text-sm text-white/75', !expanded && 'line-clamp-3', onToggleExpand && 'cursor-pointer')}>{card.overview}</p>
        )}
      </div>
    </div>
  );
}
```

Note: the meta line renders "★" via the icon *and* the text; keep the text form (`★ 8.1`) so the test's `/8\.1/` matches and screen readers hear a rating. Runtime `1h 30m` matches `formatRuntime(90)`.

- [ ] **Step 4: Implement `SwipeCard.tsx`**

```tsx
import { forwardRef, useImperativeHandle, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { MovieNightCard } from '@/lib/api';
import { MovieCardFace } from './MovieCardFace';

export type SwipeDirection = 'left' | 'right' | 'up';
export interface SwipeCardHandle { fly(direction: SwipeDirection): void }

const ROTATION_PER_PX = 0.08;
const MAX_ROTATION = 18;
const THRESHOLD_RATIO = 0.35;
const VELOCITY_THRESHOLD = 0.5; // px per ms
const FLY_DISTANCE = 3; // × card width

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

interface Props {
  card: MovieNightCard;
  onSwipe: (direction: SwipeDirection) => void;
  interactive?: boolean;
  /** 0 = top card, 1 and 2 peek from behind. */
  depth?: 0 | 1 | 2;
  /** Play the return animation from this side (undo). */
  entering?: SwipeDirection;
}

/**
 * One card in the deck. Held from its bottom edge: it tilts with the drag,
 * stamps YES / NOPE as it goes, and either flies off or springs back. All
 * motion is a single transform on one element so the phone stays at 60 fps.
 */
export const SwipeCard = forwardRef<SwipeCardHandle, Props>(function SwipeCard({ card, onSwipe, interactive = true, depth = 0, entering }, ref) {
  const el = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startX: number; startY: number; lastX: number; lastT: number; velocity: number } | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState<SwipeDirection | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [entered, setEntered] = useState(!entering);

  const width = () => el.current?.offsetWidth || 320;

  function fly(direction: SwipeDirection) {
    if (leaving) return;
    setDragging(false);
    setLeaving(direction);
    const w = width();
    setOffset(direction === 'up' ? { x: 0, y: -w * 2 } : { x: (direction === 'right' ? 1 : -1) * w * FLY_DISTANCE, y: offset.y });
    if (reducedMotion()) onSwipe(direction);
  }
  useImperativeHandle(ref, () => ({ fly }));

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!interactive || leaving || !event.isPrimary) return;
    drag.current = { startX: event.clientX, startY: event.clientY, lastX: event.clientX, lastT: performance.now(), velocity: 0 };
    el.current?.setPointerCapture?.(event.pointerId);
    setDragging(true);
  }
  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current; if (!d) return;
    const now = performance.now();
    const dt = Math.max(1, now - d.lastT);
    d.velocity = (event.clientX - d.lastX) / dt;
    d.lastX = event.clientX; d.lastT = now;
    setOffset({ x: event.clientX - d.startX, y: (event.clientY - d.startY) * 0.4 });
  }
  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current; if (!d) return;
    drag.current = null;
    el.current?.releasePointerCapture?.(event.pointerId);
    const dx = event.clientX - d.startX;
    const past = Math.abs(dx) > width() * THRESHOLD_RATIO || Math.abs(d.velocity) > VELOCITY_THRESHOLD;
    if (past) fly(dx > 0 || (Math.abs(dx) <= width() * THRESHOLD_RATIO && d.velocity > 0) ? 'right' : 'left');
    else { setDragging(false); setOffset({ x: 0, y: 0 }); }
  }
  function onTransitionEnd() {
    if (leaving) onSwipe(leaving);
    if (!entered) setEntered(true);
  }

  // Undo: mount off-screen on the side the card left from, then slide in on the next frame.
  if (entering && !entered && offset.x === 0 && offset.y === 0) {
    const w = width();
    queueMicrotask(() => requestAnimationFrame(() => setOffset({ x: 0.001, y: 0 })));
    setOffset(entering === 'up' ? { x: 0, y: -w * 2 } : { x: (entering === 'right' ? 1 : -1) * w * FLY_DISTANCE, y: 0 });
  }

  const rotation = Math.max(-MAX_ROTATION, Math.min(MAX_ROTATION, offset.x * ROTATION_PER_PX));
  const progress = Math.min(1, Math.abs(offset.x) / (width() * THRESHOLD_RATIO));
  const stackTransform = depth === 0 ? '' : ` scale(${1 - depth * 0.05}) translateY(${depth * 12}px)`;
  const transform = `translate3d(${offset.x}px, ${offset.y}px, 0) rotate(${rotation}deg)${stackTransform}`;
  const transition = dragging ? 'none'
    : leaving ? 'transform 350ms cubic-bezier(.2,.8,.2,1), opacity 350ms'
      : 'transform 300ms cubic-bezier(.34,1.56,.64,1)';

  return (
    <div ref={el} data-testid="swipe-card" data-depth={depth} data-leaving={leaving ?? undefined}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      onTransitionEnd={onTransitionEnd}
      style={{ transform, transition, transformOrigin: '50% 100%', touchAction: 'none', zIndex: 10 - depth, opacity: leaving && reducedMotion() ? 0 : 1 }}
      className="absolute inset-0 select-none will-change-transform">
      <MovieCardFace card={card} expanded={expanded} onToggleExpand={() => setExpanded((v) => !v)} />
      {depth === 0 && <>
        <span aria-hidden={progress === 0 || offset.x <= 0} style={{ opacity: offset.x > 0 ? progress : 0, transform: 'rotate(-12deg)' }}
          className="pointer-events-none absolute left-6 top-8 rounded-lg border-4 border-emerald-400 px-3 py-1 text-3xl font-black tracking-widest text-emerald-400">YES</span>
        <span aria-hidden={progress === 0 || offset.x >= 0} style={{ opacity: offset.x < 0 ? progress : 0, transform: 'rotate(12deg)' }}
          className="pointer-events-none absolute right-6 top-8 rounded-lg border-4 border-rose-500 px-3 py-1 text-3xl font-black tracking-widest text-rose-500">NOPE</span>
      </>}
    </div>
  );
});
```

The rotation for a 60px drag is `4.8deg`; a 400px drag is capped at `18deg` — both asserted in the tests. In the flown state `leaving` is set and the transform's x is `±width*3`.

- [ ] **Step 5: Run tests**

Run: `bun run test -- src/components/movie-night/SwipeCard.test.tsx`
Expected: PASS (5). If the spring-back assertion sees `rotate(0deg)` with `-0`, normalise: `const rotation = ... || 0`.

- [ ] **Step 6: Commit**

```bash
git add src/components/movie-night/MovieCardFace.tsx src/components/movie-night/SwipeCard.tsx src/components/movie-night/SwipeCard.test.tsx
git commit -m "feat(movie-night): swipe card with drag rotation and fly-out"
```

---

### Task 9: SwipeDeck + MatchOverlay

**Files:**
- Create: `src/components/movie-night/SwipeDeck.tsx`
- Create: `src/components/movie-night/MatchOverlay.tsx`
- Test: `src/components/movie-night/SwipeDeck.test.tsx`

**Interfaces:**
- Produces:
  ```tsx
  export function SwipeDeck({ cards, index, onVote, onUndo, canUndo }: { cards: MovieNightCard[]; index: number; onVote: (card: MovieNightCard, vote: MovieNightVote) => void; onUndo: () => void; canUndo: boolean })
  export function MatchOverlay({ card, title, subtitle, actions, open }: { card: MovieNightCard; title?: string; subtitle?: string; actions?: ReactNode; open: boolean })
  ```
  `SwipeDeck` shows `cards[index]` on top, `index+1` and `index+2` behind. Buttons: No (left), Maybe (up), Yes (right), Undo. Direction → vote mapping: left=no, right=yes, up=maybe. When `index >= cards.length` it renders an "all done" panel (`data-testid="deck-done"`). `MatchOverlay` vibrates once when it opens (`navigator.vibrate?.([100, 50, 100])`).

- [ ] **Step 1: Write the failing test**

`src/components/movie-night/SwipeDeck.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MatchOverlay } from './MatchOverlay';
import { SwipeDeck } from './SwipeDeck';

const cards = [{ id: 'a', title: 'Alpha' }, { id: 'b', title: 'Beta' }, { id: 'c', title: 'Gamma' }, { id: 'd', title: 'Delta' }];

describe('SwipeDeck', () => {
  it('stacks the current card and the next two', () => {
    render(<SwipeDeck cards={cards} index={0} onVote={vi.fn()} onUndo={vi.fn()} canUndo={false} />);
    const stack = screen.getAllByTestId('swipe-card');
    expect(stack).toHaveLength(3);
    expect(stack.map((el) => el.dataset.depth)).toEqual(['2', '1', '0']);
    expect(screen.getByRole('heading', { name: 'Alpha' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Delta' })).not.toBeInTheDocument();
  });

  it('buttons fly the top card and report the vote after the transition', () => {
    const onVote = vi.fn();
    render(<SwipeDeck cards={cards} index={0} onVote={onVote} onUndo={vi.fn()} canUndo={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Maybe' }));
    const top = screen.getAllByTestId('swipe-card').find((el) => el.dataset.depth === '0')!;
    expect(top.dataset.leaving).toBe('up');
    fireEvent.transitionEnd(top);
    expect(onVote).toHaveBeenCalledWith(cards[0], 'maybe');
  });

  it('enables undo only when allowed and shows the done panel at the end', () => {
    const onUndo = vi.fn();
    const { rerender } = render(<SwipeDeck cards={cards} index={1} onVote={vi.fn()} onUndo={onUndo} canUndo />);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onUndo).toHaveBeenCalled();
    rerender(<SwipeDeck cards={cards} index={4} onVote={vi.fn()} onUndo={onUndo} canUndo={false} />);
    expect(screen.getByTestId('deck-done')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });
});

describe('MatchOverlay', () => {
  it('vibrates when it opens and shows the card', () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate });
    const { rerender } = render(<MatchOverlay card={cards[0]} open={false} />);
    expect(vibrate).not.toHaveBeenCalled();
    rerender(<MatchOverlay card={cards[0]} open />);
    expect(vibrate).toHaveBeenCalledWith([100, 50, 100]);
    expect(screen.getByText("It's a match!")).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Alpha' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun run test -- src/components/movie-night/SwipeDeck.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `SwipeDeck.tsx`**

```tsx
import { useRef, useState } from 'react';
import { HelpCircle, RotateCcw, ThumbsDown, ThumbsUp } from 'lucide-react';
import type { MovieNightCard, MovieNightVote } from '@/lib/api';
import { SwipeCard, type SwipeCardHandle, type SwipeDirection } from './SwipeCard';

const VOTE_OF: Record<SwipeDirection, MovieNightVote> = { left: 'no', right: 'yes', up: 'maybe' };
const DIRECTION_OF: Record<MovieNightVote, SwipeDirection> = { no: 'left', yes: 'right', maybe: 'up' };

interface Props {
  cards: MovieNightCard[];
  index: number;
  onVote: (card: MovieNightCard, vote: MovieNightVote) => void;
  onUndo: () => void;
  canUndo: boolean;
  /** Vote of the card just undone, so it can slide back in from the right side. */
  lastUndoneVote?: MovieNightVote;
}

/** The stack: the current card on top, two peeking behind, and the vote buttons. */
export function SwipeDeck({ cards, index, onVote, onUndo, canUndo, lastUndoneVote }: Props) {
  const top = useRef<SwipeCardHandle>(null);
  const [enteringFor, setEnteringFor] = useState<{ id: string; from: SwipeDirection } | undefined>();
  const visible = cards.slice(index, index + 3);
  const done = index >= cards.length;

  function undo() {
    if (!canUndo) return;
    const previous = cards[index - 1];
    if (previous && lastUndoneVote) setEnteringFor({ id: previous.id, from: DIRECTION_OF[lastUndoneVote] });
    onUndo();
  }

  return (
    <div className="flex h-full flex-col">
      <div className="relative flex-1">
        {done
          ? <div data-testid="deck-done" className="flex h-full flex-col items-center justify-center rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
            <p className="text-2xl font-bold">You're through the deck</p>
            <p className="mt-2 text-white/70">Waiting for the others to finish.</p>
          </div>
          : [...visible].reverse().map((card, i) => {
            const depth = (visible.length - 1 - i) as 0 | 1 | 2;
            return <SwipeCard key={card.id} ref={depth === 0 ? top : undefined} card={card} depth={depth} interactive={depth === 0}
              entering={enteringFor?.id === card.id ? enteringFor.from : undefined}
              onSwipe={(direction) => onVote(card, VOTE_OF[direction])} />;
          })}
      </div>
      <div className="mt-5 flex items-center justify-center gap-4">
        <button type="button" aria-label="Undo" disabled={!canUndo} onClick={undo}
          className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white/80 disabled:opacity-30"><RotateCcw className="h-5 w-5" aria-hidden="true" /></button>
        <button type="button" aria-label="No" disabled={done} onClick={() => top.current?.fly('left')}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-500/15 text-rose-400 ring-2 ring-rose-500/60 active:scale-95 disabled:opacity-30"><ThumbsDown className="h-7 w-7" aria-hidden="true" /></button>
        <button type="button" aria-label="Maybe" disabled={done} onClick={() => top.current?.fly('up')}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-400/15 text-amber-300 ring-2 ring-amber-400/60 active:scale-95 disabled:opacity-30"><HelpCircle className="h-6 w-6" aria-hidden="true" /></button>
        <button type="button" aria-label="Yes" disabled={done} onClick={() => top.current?.fly('right')}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400 ring-2 ring-emerald-500/60 active:scale-95 disabled:opacity-30"><ThumbsUp className="h-7 w-7" aria-hidden="true" /></button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Implement `MatchOverlay.tsx`**

```tsx
import { useEffect, type ReactNode } from 'react';
import type { MovieNightCard } from '@/lib/api';
import { MovieCardFace } from './MovieCardFace';

/** Full-screen "It's a match!" used by the phone and the TV. */
export function MatchOverlay({ card, open, title = "It's a match!", subtitle, actions }: { card: MovieNightCard; open: boolean; title?: string; subtitle?: string; actions?: ReactNode }) {
  useEffect(() => {
    if (open) { try { navigator.vibrate?.([100, 50, 100]); } catch { /* unsupported */ } }
  }, [open]);
  if (!open) return null;
  return (
    <div role="dialog" aria-label={title} className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-black/90 p-6 text-white backdrop-blur">
      <p className="text-4xl font-black tracking-tight sm:text-6xl motion-safe:animate-[pulse_1.2s_ease-in-out_2]">{title}</p>
      {subtitle && <p className="text-white/70">{subtitle}</p>}
      <div className="aspect-[2/3] w-64 max-w-[70vw] motion-safe:animate-[zoomIn_400ms_cubic-bezier(.2,.8,.2,1)] sm:w-80"><MovieCardFace card={card} expanded /></div>
      {actions && <div className="flex flex-wrap justify-center gap-3">{actions}</div>}
    </div>
  );
}
```

Add to `src/index.css` (once):

```css
@keyframes zoomIn { from { transform: scale(0.6); opacity: 0; } to { transform: scale(1); opacity: 1; } }
```

- [ ] **Step 5: Run tests**

Run: `bun run test -- src/components/movie-night`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/movie-night src/index.css
git commit -m "feat(movie-night): swipe deck stack and match overlay"
```

---

### Task 10: Phone route `/movie-night/join`

**Files:**
- Create: `src/routes/MovieNightJoin.tsx`
- Test: `src/routes/MovieNightJoin.test.tsx`

**Interfaces:**
- Consumes: `api.movieNight.*`, `loadParticipant/saveParticipant/clearParticipant`, `useMovieNightSocket`, `SwipeDeck`, `MatchOverlay`.
- Phases: `entry` (code+nickname form) → `waiting` → `swiping` → `ended`; `match` overlays any of them while an undismissed match exists.
- Index = first deck position without a vote (from `state.votes`), tracked locally afterward; undo re-votes by `DELETE` and decrements.

- [ ] **Step 1: Write the failing test**

`src/routes/MovieNightJoin.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MovieNightJoin } from './MovieNightJoin';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const cards = [{ id: 'a', title: 'Alpha' }, { id: 'b', title: 'Beta' }];

class FakeSocket {
  static last: FakeSocket | undefined;
  onopen: (() => void) | null = null; onmessage: ((e: { data: string }) => void) | null = null; onclose: ((e: { code: number }) => void) | null = null;
  constructor(readonly url: string) { FakeSocket.last = this; }
  close() {}
  push(message: unknown) { this.onmessage?.({ data: JSON.stringify(message) }); }
}

function mockApi(state: { phase: string; votes?: Record<string, string> }) {
  const calls: string[] = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); calls.push(`${init?.method ?? 'GET'} ${url}`);
    if (url.endsWith('/join')) return json({ participantId: 'p1', token: 'tok' });
    if (url.endsWith('/deck')) return json({ cards });
    if (url.endsWith('/votes/a') || url.endsWith('/votes/b')) return json({ ok: true });
    if (url.endsWith('/participants/p1')) return json({ ok: true });
    return json({ role: 'participant', state: { code: 'AAAA-BBBB', phase: state.phase, deckSize: 2, participants: [{ id: 'p1', nickname: 'Ann', joinedAt: 1 }], matches: [], dismissed: [], allDone: false, votes: state.votes ?? {}, participantId: 'p1' } });
  }) as unknown as typeof fetch;
  return calls;
}

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; localStorage.clear(); vi.unstubAllGlobals(); });
beforeEach(() => {
  vi.stubGlobal('WebSocket', FakeSocket);
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 300 });
  HTMLElement.prototype.setPointerCapture = vi.fn(); HTMLElement.prototype.releasePointerCapture = vi.fn();
});

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><MovieNightJoin /></MemoryRouter>);
}

describe('MovieNightJoin (the phone)', () => {
  it('joins with a nickname, stores the token, and waits for the host', async () => {
    const calls = mockApi({ phase: 'lobby' });
    renderAt('/movie-night/join?code=AAAA-BBBB');
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Ann' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    expect(await screen.findByText(/Waiting for the host/)).toBeInTheDocument();
    expect(calls).toContain('POST /api/v1/movie-night/AAAA-BBBB/join');
    expect(JSON.parse(localStorage.getItem('dose.movieNight.AAAA-BBBB')!)).toEqual({ participantId: 'p1', token: 'tok' });
  });

  it('rejoins from a stored token and resumes at the first unvoted card', async () => {
    localStorage.setItem('dose.movieNight.AAAA-BBBB', JSON.stringify({ participantId: 'p1', token: 'tok' }));
    mockApi({ phase: 'swiping', votes: { a: 'no' } });
    renderAt('/movie-night/join?code=AAAA-BBBB');
    expect(await screen.findByRole('heading', { name: 'Beta' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Alpha' })).not.toBeInTheDocument();
  });

  it('votes through the buttons and shows the match when the socket says so', async () => {
    localStorage.setItem('dose.movieNight.AAAA-BBBB', JSON.stringify({ participantId: 'p1', token: 'tok' }));
    const calls = mockApi({ phase: 'swiping' });
    renderAt('/movie-night/join?code=AAAA-BBBB');
    await screen.findByRole('heading', { name: 'Alpha' });
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    const top = screen.getAllByTestId('swipe-card').find((el) => el.dataset.depth === '0')!;
    fireEvent.transitionEnd(top);
    await waitFor(() => expect(calls).toContain('PUT /api/v1/movie-night/AAAA-BBBB/votes/a'));
    expect(await screen.findByRole('heading', { name: 'Beta' })).toBeInTheDocument();
    FakeSocket.last?.push({ type: 'match', card: cards[0] });
    expect(await screen.findByText("It's a match!")).toBeInTheDocument();
    FakeSocket.last?.push({ type: 'match.dismissed', cardId: 'a' });
    await waitFor(() => expect(screen.queryByText("It's a match!")).not.toBeInTheDocument());
  });

  it('clears the token and says goodbye when the night ends', async () => {
    localStorage.setItem('dose.movieNight.AAAA-BBBB', JSON.stringify({ participantId: 'p1', token: 'tok' }));
    mockApi({ phase: 'swiping' });
    renderAt('/movie-night/join?code=AAAA-BBBB');
    await screen.findByRole('heading', { name: 'Alpha' });
    FakeSocket.last?.push({ type: 'ended' });
    expect(await screen.findByText(/Night over/)).toBeInTheDocument();
    expect(localStorage.getItem('dose.movieNight.AAAA-BBBB')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun run test -- src/routes/MovieNightJoin.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/routes/MovieNightJoin.tsx`**

```tsx
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MatchOverlay } from '@/components/movie-night/MatchOverlay';
import { SwipeDeck } from '@/components/movie-night/SwipeDeck';
import { api, ApiError, type MovieNightCard, type MovieNightMessage, type MovieNightState, type MovieNightVote } from '@/lib/api';
import { clearParticipant, loadParticipant, saveParticipant, useMovieNightSocket } from '@/lib/movie-night';

type Phase = 'entry' | 'joining' | 'waiting' | 'swiping' | 'ended' | 'error';

/**
 * The phone. Reached by scanning the QR on the TV; no Dose account involved.
 * A stored participant token lets a reload rejoin silently.
 */
export function MovieNightJoin() {
  const [search] = useSearchParams();
  const codeFromScan = (search.get('code') ?? '').toUpperCase();
  const [code, setCode] = useState(codeFromScan);
  const [nickname, setNickname] = useState('');
  const [phase, setPhase] = useState<Phase>('entry');
  const [message, setMessage] = useState<string>();
  const [participant, setParticipant] = useState<{ participantId: string; token: string }>();
  const [state, setState] = useState<MovieNightState>();
  const [cards, setCards] = useState<MovieNightCard[]>([]);
  const [votes, setVotes] = useState<Record<string, MovieNightVote>>({});
  const [index, setIndex] = useState(0);
  const [history, setHistory] = useState<Array<{ id: string; vote: MovieNightVote }>>([]);

  const activeMatch = useMemo(() => state?.matches.filter((card) => !state.dismissed.includes(card.id)).at(-1), [state]);

  /** Refetch state + deck; used after join, on reconnect, and on phase changes. */
  const sync = useCallback(async (session: string, auth: { participantId: string; token: string }) => {
    const [{ state: next }, { cards: deck }] = await Promise.all([api.movieNight.state(session, auth.token), api.movieNight.deck(session, auth.token)]);
    setState(next); setCards(deck);
    const own = next.votes ?? {};
    setVotes(own);
    const first = deck.findIndex((card) => !own[card.id]);
    setIndex(first === -1 ? deck.length : first);
    setPhase(next.phase === 'lobby' ? 'waiting' : next.phase === 'swiping' ? 'swiping' : 'ended');
  }, []);

  // Silent rejoin from a stored token.
  useEffect(() => {
    if (!codeFromScan) return;
    const stored = loadParticipant(codeFromScan);
    if (!stored) return;
    setParticipant(stored); setPhase('joining');
    void sync(codeFromScan, stored).catch(() => { clearParticipant(codeFromScan); setParticipant(undefined); setPhase('entry'); });
  }, [codeFromScan, sync]);

  async function join(event: FormEvent) {
    event.preventDefault();
    const session = code.trim().toUpperCase();
    if (!session || !nickname.trim()) return;
    setPhase('joining'); setMessage(undefined);
    try {
      const joined = await api.movieNight.join(session, nickname);
      saveParticipant(session, joined);
      setParticipant(joined); setCode(session);
      await sync(session, joined);
    } catch (caught) {
      setPhase('entry');
      setMessage(caught instanceof ApiError && caught.status === 404 ? 'No movie night with that code.'
        : caught instanceof ApiError && caught.status === 409 ? (caught.message || 'That name is taken.')
          : caught instanceof Error ? caught.message : 'Could not join.');
    }
  }

  const onMessage = useCallback((incoming: MovieNightMessage) => {
    setState((current) => {
      if (!current) return current;
      switch (incoming.type) {
        case 'participant.joined': return { ...current, participants: [...current.participants.filter((p) => p.id !== incoming.participant.id), incoming.participant] };
        case 'participant.left': return { ...current, participants: current.participants.filter((p) => p.id !== incoming.participantId) };
        case 'phase.changed': return { ...current, phase: incoming.phase };
        case 'match': return { ...current, matches: [...current.matches, incoming.card] };
        case 'match.dismissed': return { ...current, dismissed: [...current.dismissed, incoming.cardId] };
        default: return current;
      }
    });
    if (incoming.type === 'phase.changed' && incoming.phase === 'swiping') setPhase('swiping');
    if (incoming.type === 'ended') { if (code) clearParticipant(code); setPhase('ended'); }
  }, [code]);
  const onClose = useCallback((closeCode: number) => { if (closeCode === 4000 || closeCode === 4404) { if (code) clearParticipant(code); setPhase('ended'); } }, [code]);
  const onOpen = useCallback(() => { if (participant && code) void sync(code, participant).catch(() => undefined); }, [participant, code, sync]);
  useMovieNightSocket(participant ? code : undefined, participant?.token, onMessage, onClose, onOpen);

  async function vote(card: MovieNightCard, value: MovieNightVote) {
    if (!participant) return;
    setVotes((v) => ({ ...v, [card.id]: value }));
    setHistory((h) => [...h, { id: card.id, vote: value }]);
    setIndex((i) => i + 1);
    try { await api.movieNight.vote(code, participant.token, card.id, value); }
    catch { /* the next sync repairs any gap */ }
  }
  async function undo() {
    const last = history.at(-1);
    if (!last || !participant) return;
    setHistory((h) => h.slice(0, -1));
    setVotes((v) => { const next = { ...v }; delete next[last.id]; return next; });
    setIndex((i) => Math.max(0, i - 1));
    try { await api.movieNight.undo(code, participant.token, last.id); } catch { /* ignore */ }
  }
  async function leave() {
    if (participant) { try { await api.movieNight.leave(code, participant.participantId, participant.token); } catch { /* ignore */ } }
    clearParticipant(code); setParticipant(undefined); setPhase('entry'); setState(undefined);
  }

  const others = state?.participants.filter((p) => p.id !== participant?.participantId) ?? [];

  return <main className="flex min-h-[100dvh] flex-col bg-[#0B0B0F] px-4 pb-6 pt-[max(1rem,env(safe-area-inset-top))] text-white">
    {phase === 'entry' && <form onSubmit={join} className="m-auto flex w-full max-w-sm flex-col gap-4">
      <img src="/logo.svg" alt="" className="mx-auto h-12 w-12" />
      <h1 className="text-center text-3xl font-bold">Movie night</h1>
      <p className="text-center text-white/70">Pick a name and start swiping. Everyone sees the same deck.</p>
      {!codeFromScan && <label className="space-y-1 text-sm"><span>Code from the TV</span><Input aria-label="Code from the TV" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="XXXX-XXXX" autoCapitalize="characters" /></label>}
      <label className="space-y-1 text-sm"><span>Your name</span><Input aria-label="Your name" value={nickname} maxLength={24} onChange={(e) => setNickname(e.target.value)} autoFocus /></label>
      {message && <p role="alert" className="text-sm text-rose-400">{message}</p>}
      <Button type="submit" size="lg" disabled={!code.trim() || !nickname.trim()}>Join</Button>
    </form>}

    {phase === 'joining' && <p role="status" className="m-auto text-white/70">Joining…</p>}

    {phase === 'waiting' && <div className="m-auto flex w-full max-w-sm flex-col items-center gap-4 text-center">
      <p className="text-2xl font-bold">Waiting for the host…</p>
      <p className="text-white/70">{state?.deckSize ?? 0} movies in the deck.</p>
      {others.length > 0 && <p className="text-sm text-white/60">Also here: {others.map((p) => p.nickname).join(', ')}</p>}
      <Button variant="ghost" onClick={() => void leave()}>Leave</Button>
    </div>}

    {phase === 'swiping' && <div className="flex flex-1 flex-col">
      <div className="mb-3 flex items-center justify-between text-sm text-white/60">
        <span>{Math.min(index, cards.length)} / {cards.length}</span>
        <button type="button" onClick={() => void leave()} className="underline-offset-2 hover:underline">Leave</button>
      </div>
      <div className="flex-1"><SwipeDeck cards={cards} index={index} onVote={(card, value) => void vote(card, value)} onUndo={() => void undo()} canUndo={history.length > 0} lastUndoneVote={history.at(-1)?.vote} /></div>
    </div>}

    {phase === 'ended' && <div className="m-auto text-center">
      <p className="text-2xl font-bold">Night over</p>
      <p className="mt-2 text-white/70">Thanks for swiping.</p>
    </div>}

    {activeMatch && phase !== 'ended' && <MatchOverlay card={activeMatch} open subtitle="Look at the TV" />}
  </main>;
}
```

Note: `votes` state is kept so a later feature can show the user's own history; it is used for the resume index via `sync`. If eslint flags it as unused, read it in the progress line instead: `Object.keys(votes).length / cards.length`.

- [ ] **Step 4: Run tests**

Run: `bun run test -- src/routes/MovieNightJoin.test.tsx`
Expected: PASS (4).

- [ ] **Step 5: Commit**

```bash
git add src/routes/MovieNightJoin.tsx src/routes/MovieNightJoin.test.tsx
git commit -m "feat(movie-night): phone join and swipe screen"
```

---

### Task 11: TV route `/movie-night`

**Files:**
- Create: `src/routes/MovieNightTv.tsx`
- Test: `src/routes/MovieNightTv.test.tsx`

**Interfaces:**
- Consumes: `api.me()`, `api.catalogCategories()`, `api.movieNight.*`, `useMovieNightSocket`, `MatchOverlay`, `MovieCardFace`, `qrcode`.
- Phases: `loading` → `setup` → `lobby` → `swiping` (board) ; `match` overlay while an undismissed match exists; `fallback` panel when `allDone` and no active match. Session code in `sessionStorage['dose.movieNight.host']`.

- [ ] **Step 1: Write the failing test**

`src/routes/MovieNightTv.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MovieNightTv } from './MovieNightTv';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
class FakeSocket {
  static last: FakeSocket | undefined;
  onopen: (() => void) | null = null; onmessage: ((e: { data: string }) => void) | null = null; onclose: ((e: { code: number }) => void) | null = null;
  constructor(readonly url: string) { FakeSocket.last = this; }
  close() {}
  push(message: unknown) { this.onmessage?.({ data: JSON.stringify(message) }); }
}
const baseState = { code: 'AAAA-BBBB', phase: 'lobby', deckSize: 12, participants: [], matches: [], dismissed: [], allDone: false };

function mockApi(overrides: Partial<typeof baseState> = {}) {
  const calls: string[] = [];
  let state = { ...baseState, ...overrides };
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); calls.push(`${init?.method ?? 'GET'} ${url}`);
    if (url.endsWith('/auth/me')) return json({ user: { id: 'host-1', username: 'owner', role: 'admin', maxMaturityLevel: null } });
    if (url.endsWith('/catalog/categories')) return json({ categories: [{ key: 'drama', name: 'Drama', count: 4 }] });
    if (url.includes('/movie-night/count')) return json({ count: 12 });
    if (url.endsWith('/api/v1/movie-night') && init?.method === 'POST') return json({ code: 'AAAA-BBBB', joinPath: '/movie-night/join?code=AAAA-BBBB', deckSize: 12 });
    if (url.endsWith('/start')) { state = { ...state, phase: 'swiping' }; return json({ ok: true }); }
    if (url.endsWith('/dismiss/a') || url.endsWith('/end')) return json({ ok: true });
    if (url.endsWith('/leaders')) return json({ entries: [{ card: { id: 'a', title: 'Alpha' }, yes: 2, maybe: 0 }] });
    return json({ role: 'host', state });
  }) as unknown as typeof fetch;
  return calls;
}

const originalFetch = globalThis.fetch;
beforeEach(() => { vi.stubGlobal('WebSocket', FakeSocket); });
afterEach(() => { globalThis.fetch = originalFetch; sessionStorage.clear(); vi.unstubAllGlobals(); });
const renderTv = () => render(<MemoryRouter><MovieNightTv /></MemoryRouter>);

describe('MovieNightTv', () => {
  it('shows filters with a live count, then a lobby with a QR after starting', async () => {
    const calls = mockApi();
    renderTv();
    expect(await screen.findByText(/12 movies/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Genre'), { target: { value: 'drama' } });
    await waitFor(() => expect(calls.some((c) => c.includes('/movie-night/count?genre=drama'))).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'Create movie night' }));
    expect(await screen.findByText('AAAA-BBBB')).toBeInTheDocument();
    const qr = await screen.findByRole('img', { name: /QR code/ });
    await waitFor(() => expect(qr.getAttribute('src')).toMatch(/^data:image\/png/));
    expect(sessionStorage.getItem('dose.movieNight.host')).toBe('AAAA-BBBB');
    expect(screen.getByRole('button', { name: 'Start swiping' })).toBeDisabled();
    FakeSocket.last?.push({ type: 'participant.joined', participant: { id: 'p1', nickname: 'Ann', joinedAt: 1 } });
    FakeSocket.last?.push({ type: 'participant.joined', participant: { id: 'p2', nickname: 'Bob', joinedAt: 2 } });
    expect(await screen.findByText('Bob')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start swiping' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Start swiping' }));
    await waitFor(() => expect(calls).toContain('POST /api/v1/movie-night/AAAA-BBBB/start'));
  });

  it('rejoins a stored session, shows progress and leaders, then the match', async () => {
    sessionStorage.setItem('dose.movieNight.host', 'AAAA-BBBB');
    mockApi({ phase: 'swiping', participants: [{ id: 'p1', nickname: 'Ann', joinedAt: 1 }] });
    renderTv();
    expect(await screen.findByText('Ann')).toBeInTheDocument();
    FakeSocket.last?.push({ type: 'progress', participantId: 'p1', done: 6, total: 12 });
    expect(await screen.findByText('6 / 12')).toBeInTheDocument();
    FakeSocket.last?.push({ type: 'leaders', entries: [{ card: { id: 'b', title: 'Beta' }, yes: 1, maybe: 0 }] });
    expect(await screen.findByText('Beta')).toBeInTheDocument();
    FakeSocket.last?.push({ type: 'match', card: { id: 'a', title: 'Alpha' } });
    expect(await screen.findByText("It's a match!")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Play now' })).toHaveAttribute('href', '/watch/a');
    fireEvent.click(screen.getByRole('button', { name: 'Keep swiping' }));
    await waitFor(() => expect(screen.queryByText("It's a match!")).not.toBeInTheDocument());
  });

  it('offers the ranked fallback when everyone is done without a match', async () => {
    sessionStorage.setItem('dose.movieNight.host', 'AAAA-BBBB');
    mockApi({ phase: 'swiping', allDone: true, participants: [{ id: 'p1', nickname: 'Ann', joinedAt: 1 }] });
    renderTv();
    expect(await screen.findByText(/No unanimous pick/)).toBeInTheDocument();
    expect(await screen.findByText('Alpha')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Alpha/ })).toHaveAttribute('href', '/watch/a');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun run test -- src/routes/MovieNightTv.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/routes/MovieNightTv.tsx`**

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import QRCode from 'qrcode';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MatchOverlay } from '@/components/movie-night/MatchOverlay';
import { MovieCardFace } from '@/components/movie-night/MovieCardFace';
import { api, ApiError, type CatalogCategorySummary, type MovieNightFilters, type MovieNightLeader, type MovieNightMessage, type MovieNightState } from '@/lib/api';
import { useMovieNightSocket } from '@/lib/movie-night';

const HOST_KEY = 'dose.movieNight.host';
type Screen = 'loading' | 'setup' | 'session' | 'ended';

/** The TV: filters → lobby with QR → live board → match or ranked fallback. */
export function MovieNightTv() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [genres, setGenres] = useState<CatalogCategorySummary[]>([]);
  const [filters, setFilters] = useState<MovieNightFilters>({});
  const [count, setCount] = useState<number>();
  const [error, setError] = useState<string>();
  const [code, setCode] = useState<string>();
  const [state, setState] = useState<MovieNightState>();
  const [qr, setQr] = useState<string>();
  const [progress, setProgress] = useState<Record<string, { done: number; total: number }>>({});
  const [leaders, setLeaders] = useState<MovieNightLeader[]>([]);
  const [busy, setBusy] = useState(false);

  const activeMatch = useMemo(() => state?.matches.filter((card) => !state.dismissed.includes(card.id)).at(-1), [state]);
  const showFallback = !!state && state.phase === 'swiping' && state.allDone && !activeMatch;

  const sync = useCallback(async (session: string) => {
    const { state: next } = await api.movieNight.state(session);
    setState(next); setCode(session); setScreen('session');
    if (next.phase === 'swiping') { try { setLeaders((await api.movieNight.leaders(session)).entries); } catch { /* not fatal */ } }
  }, []);

  // Signed-in check, then rejoin a stored session or show the setup.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try { await api.me(); } catch { window.location.assign('/'); return; }
      const stored = sessionStorage.getItem(HOST_KEY);
      if (stored) {
        try { await sync(stored); return; }
        catch { sessionStorage.removeItem(HOST_KEY); }
      }
      if (!cancelled) setScreen('setup');
    })();
    return () => { cancelled = true; };
  }, [sync]);

  useEffect(() => {
    if (screen !== 'setup') return;
    void api.catalogCategories().then(({ categories }) => setGenres(categories)).catch(() => setGenres([]));
  }, [screen]);

  // Live count as the filters change.
  useEffect(() => {
    if (screen !== 'setup') return;
    let stale = false;
    void api.movieNight.count(filters).then(({ count: n }) => { if (!stale) setCount(n); }).catch(() => { if (!stale) setCount(undefined); });
    return () => { stale = true; };
  }, [filters, screen]);

  // QR for the lobby, generated locally.
  useEffect(() => {
    if (!code || state?.phase !== 'lobby') { setQr(undefined); return; }
    const url = new URL(`/movie-night/join?code=${code}`, window.location.origin).href;
    void QRCode.toDataURL(url, { margin: 1, width: 360, color: { dark: '#0B0B0F', light: '#F2EFE6' } }).then(setQr).catch(() => setQr(undefined));
  }, [code, state?.phase]);

  const onMessage = useCallback((incoming: MovieNightMessage) => {
    setState((current) => {
      if (!current) return current;
      switch (incoming.type) {
        case 'participant.joined': return { ...current, participants: [...current.participants.filter((p) => p.id !== incoming.participant.id), incoming.participant] };
        case 'participant.left': return { ...current, participants: current.participants.filter((p) => p.id !== incoming.participantId) };
        case 'phase.changed': return { ...current, phase: incoming.phase };
        case 'match': return { ...current, matches: [...current.matches, incoming.card] };
        case 'match.dismissed': return { ...current, dismissed: [...current.dismissed, incoming.cardId] };
        default: return current;
      }
    });
    if (incoming.type === 'progress') setProgress((p) => ({ ...p, [incoming.participantId]: { done: incoming.done, total: incoming.total } }));
    if (incoming.type === 'leaders') setLeaders(incoming.entries);
    if (incoming.type === 'participant.left') setProgress((p) => { const next = { ...p }; delete next[incoming.participantId]; return next; });
    // allDone is server-derived; refetch it whenever votes or the roster move.
    if ((incoming.type === 'progress' || incoming.type === 'participant.left' || incoming.type === 'match.dismissed') && code) {
      void api.movieNight.state(code).then(({ state: next }) => setState((cur) => cur ? { ...cur, allDone: next.allDone } : cur)).catch(() => undefined);
    }
    if (incoming.type === 'ended') { sessionStorage.removeItem(HOST_KEY); setScreen('ended'); }
  }, [code]);
  const onClose = useCallback(() => { sessionStorage.removeItem(HOST_KEY); setScreen('ended'); }, []);
  const onOpen = useCallback(() => { if (code) void sync(code).catch(() => undefined); }, [code, sync]);
  useMovieNightSocket(screen === 'session' ? code : undefined, undefined, onMessage, onClose, onOpen);

  async function create() {
    setBusy(true); setError(undefined);
    try {
      const created = await api.movieNight.create(filters);
      sessionStorage.setItem(HOST_KEY, created.code);
      await sync(created.code);
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Could not create the movie night.'); }
    finally { setBusy(false); }
  }
  async function act(action: () => Promise<unknown>) {
    setBusy(true); try { await action(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Something went wrong.'); } finally { setBusy(false); }
  }
  const number = (value: string) => value === '' ? undefined : Number(value);

  if (screen === 'loading') return <main className="flex min-h-screen items-center justify-center bg-background text-muted-foreground"><p role="status">Loading…</p></main>;

  if (screen === 'ended') return <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background text-foreground">
    <h1 className="text-4xl font-bold">Night ended</h1>
    <Button onClick={() => { setState(undefined); setCode(undefined); setLeaders([]); setProgress({}); setScreen('setup'); }}>Start another</Button>
    <Button asChild variant="ghost"><Link to="/">Back to the library</Link></Button>
  </main>;

  if (screen === 'setup') return <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center gap-6 bg-background px-6 py-12 text-foreground">
    <div className="text-center">
      <h1 className="text-4xl font-bold tracking-tight">Movie night</h1>
      <p className="mt-2 text-muted-foreground">Everyone swipes the same deck on their phone. The first film all of you say yes to wins.</p>
    </div>
    <div className="grid grid-cols-2 gap-4 rounded-2xl border p-6">
      <label className="col-span-2 space-y-1 text-sm"><span>Genre</span><select aria-label="Genre" className="h-11 w-full rounded-md border bg-background px-3" value={filters.genre ?? ''} onChange={(e) => setFilters((old) => ({ ...old, genre: e.target.value || undefined }))}><option value="">Any</option>{genres.map((g) => <option key={g.key} value={g.key}>{g.name}</option>)}</select></label>
      <label className="space-y-1 text-sm"><span>From year</span><Input aria-label="From year" type="number" min={1888} max={2200} value={filters.yearMin ?? ''} onChange={(e) => setFilters((old) => ({ ...old, yearMin: number(e.target.value) }))} /></label>
      <label className="space-y-1 text-sm"><span>To year</span><Input aria-label="To year" type="number" min={1888} max={2200} value={filters.yearMax ?? ''} onChange={(e) => setFilters((old) => ({ ...old, yearMax: number(e.target.value) }))} /></label>
      <label className="space-y-1 text-sm"><span>Minimum rating</span><Input aria-label="Minimum rating" type="number" min={0} max={10} step={0.1} value={filters.ratingMin ?? ''} onChange={(e) => setFilters((old) => ({ ...old, ratingMin: number(e.target.value) }))} /></label>
      <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" aria-label="Unwatched only" checked={!!filters.unwatchedOnly} onChange={(e) => setFilters((old) => ({ ...old, unwatchedOnly: e.target.checked || undefined }))} className="h-5 w-5" /><span>Unwatched only</span></label>
    </div>
    <p role="status" className="text-center text-lg">{count == null ? 'Counting…' : `${count} movies in the deck`}</p>
    {error && <p role="alert" className="text-center text-sm text-destructive">{error}</p>}
    <Button size="lg" className="mx-auto" disabled={busy || !count} onClick={() => void create()}>Create movie night</Button>
    <Button asChild variant="ghost" className="mx-auto"><Link to="/">Cancel</Link></Button>
  </main>;

  // screen === 'session'
  const participants = state?.participants ?? [];
  return <main className="min-h-screen bg-background px-8 py-10 text-foreground">
    {state?.phase === 'lobby' && code && <div className="mx-auto grid max-w-5xl gap-10 md:grid-cols-[auto_1fr]">
      <div className="flex flex-col items-center gap-4">
        <div className="rounded-3xl border bg-[#F2EFE6] p-4">
          {qr ? <img src={qr} alt={`QR code linking to /movie-night/join?code=${code}`} className="h-72 w-72" /> : <div className="flex h-72 w-72 items-center justify-center text-sm text-[#0B0B0F]/60">Generating…</div>}
        </div>
        <p className="text-sm uppercase tracking-widest text-muted-foreground">Or enter this code</p>
        <p className="font-mono text-5xl font-bold tracking-[0.2em]">{code}</p>
        <p className="text-sm text-muted-foreground">at {window.location.host}/movie-night/join</p>
      </div>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-4xl font-bold">Scan to join</h1>
          <p className="mt-2 text-muted-foreground">{state.deckSize} movies in the deck. Start once everyone is in.</p>
        </div>
        <ul className="flex flex-wrap gap-3" aria-label="Participants">
          {participants.map((p) => <li key={p.id} className="flex items-center gap-2 rounded-full border bg-muted px-4 py-2 text-lg motion-safe:animate-[zoomIn_300ms_ease-out]">
            <span>{p.nickname}</span>
            <button type="button" aria-label={`Remove ${p.nickname}`} onClick={() => void act(() => api.movieNight.leave(code, p.id))} className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" aria-hidden="true" /></button>
          </li>)}
          {participants.length === 0 && <li className="text-muted-foreground">Nobody yet…</li>}
        </ul>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-3">
          <Button size="lg" disabled={busy || participants.length < 2} onClick={() => void act(() => api.movieNight.start(code))}>Start swiping</Button>
          <Button size="lg" variant="ghost" onClick={() => void act(() => api.movieNight.end(code))}>Cancel</Button>
        </div>
      </div>
    </div>}

    {state?.phase === 'swiping' && code && <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(16rem,1fr)_2fr]">
      <section>
        <h1 className="text-3xl font-bold">Swiping…</h1>
        <ul className="mt-6 space-y-4" aria-label="Progress">
          {participants.map((p) => {
            const done = progress[p.id]?.done ?? 0; const total = progress[p.id]?.total ?? state.deckSize;
            return <li key={p.id}>
              <div className="flex justify-between text-lg"><span>{p.nickname}</span><span className="tabular-nums text-muted-foreground">{done} / {total}</span></div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-foreground transition-[width] duration-500" style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></div>
            </li>;
          })}
        </ul>
        {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
        <Button variant="ghost" className="mt-8" onClick={() => void act(() => api.movieNight.end(code))}>End night</Button>
      </section>
      <section>
        <h2 className="text-xl font-semibold text-muted-foreground">{showFallback ? 'No unanimous pick — the crowd favourites' : 'Leading so far'}</h2>
        {showFallback && <p className="mt-1 text-sm text-muted-foreground">Everyone finished the deck. Tap a title to play it.</p>}
        <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
          {leaders.map(({ card, yes, maybe }) => <li key={card.id} className="aspect-[2/3]">
            {showFallback
              ? <Link to={`/watch/${encodeURIComponent(card.id)}`} aria-label={`${card.title}: ${yes} yes, ${maybe} maybe`} className="block h-full rounded-3xl ring-offset-background transition hover:ring-4 hover:ring-foreground"><MovieCardFace card={card} /></Link>
              : <div className="relative h-full"><MovieCardFace card={card} /><span className="absolute right-3 top-3 rounded-full bg-emerald-500 px-2 py-0.5 text-sm font-bold text-black">{yes} yes</span></div>}
          </li>)}
          {leaders.length === 0 && <li className="col-span-full text-muted-foreground">No votes yet.</li>}
        </ul>
      </section>
    </div>}

    {activeMatch && code && <MatchOverlay card={activeMatch} open subtitle="Everyone said yes" actions={<>
      <Button asChild size="lg"><Link to={`/watch/${encodeURIComponent(activeMatch.id)}`}>Play now</Link></Button>
      <Button size="lg" variant="secondary" disabled={busy} onClick={() => void act(() => api.movieNight.dismiss(code, activeMatch.id))}>Keep swiping</Button>
      <Button size="lg" variant="ghost" disabled={busy} onClick={() => void act(() => api.movieNight.end(code))}>End night</Button>
    </>} />}
  </main>;
}
```

In the fallback the leaders grid is reused; `MovieCardFace` already shows the title so the `Alpha` text assertion holds. If `Button` has no `secondary` variant, use `outline` (check `src/components/ui/button.tsx`).

- [ ] **Step 4: Run tests**

Run: `bun run test -- src/routes/MovieNightTv.test.tsx`
Expected: PASS (3).

- [ ] **Step 5: Commit**

```bash
git add src/routes/MovieNightTv.tsx src/routes/MovieNightTv.test.tsx
git commit -m "feat(movie-night): TV setup, lobby, board and match screens"
```

---

### Task 12: Entry points, lint, full verification

**Files:**
- Modify: `src/routes/router.tsx`
- Modify: `src/components/media/UserMenu.tsx`
- Modify: `src/server/app.ts` CSP only if needed (it already allows `ws:`/`wss:` and `data:` images — no change expected)

- [ ] **Step 1: Routes**

In `src/routes/router.tsx` add imports and entries:

```tsx
import { MovieNightTv } from '@/routes/MovieNightTv';
import { MovieNightJoin } from '@/routes/MovieNightJoin';
// ...
  // Movie night: /movie-night runs on the TV, /movie-night/join on each phone.
  { path: '/movie-night', element: <MovieNightTv /> },
  { path: '/movie-night/join', element: <MovieNightJoin /> },
```

- [ ] **Step 2: User menu**

In `src/components/media/UserMenu.tsx` import `PartyPopper` from `lucide-react` and add right after the "Random pick" item:

```tsx
<DropdownMenuItem asChild><a href="/movie-night"><PartyPopper className="mr-2 h-4 w-4" aria-hidden="true" />Movie night</a></DropdownMenuItem>
```

- [ ] **Step 3: Verify everything**

Run, in order, and fix anything that fails:

```bash
bun run lint
```
```bash
bun run build
```
```bash
bun run test
```

Expected: lint clean, build clean, every test green (including pre-existing suites).

- [ ] **Step 4: Manual smoke in the browser (dev server)**

Start the dev server through the preview tool (`.claude/launch.json` config), open `/movie-night`, create a night, open `/movie-night/join?code=…` in a second tab with the mobile preset, join as two different names (two tabs), start, swipe the same title right on both, and confirm the overlay appears on all three tabs. Screenshot the TV match screen.

- [ ] **Step 5: Commit**

```bash
git add src/routes/router.tsx src/components/media/UserMenu.tsx
git commit -m "feat(movie-night): routes and user-menu entry"
```

---

## Self-review

- **Spec coverage.** Flow §1: setup/lobby/board/match/fallback (Task 11), phone entry/waiting/deck/match/done/ended (Task 10), late joiners + leavers (Task 3), token storage (Task 7). Server §2: deck build + maturity + unwatched + cap (Task 1, 2), match rule/leaders/nickname/token/limits/host/TTL (Tasks 2–3), realtime audiences (Task 4), HTTP table + throttle + 404 (Task 5), socket (Tasks 5–6). Client §3: routes/entry (Task 12), socket hook + resync on reconnect (Task 7, `onOpen`), swipe mechanics incl. rotation cap, thresholds, stamps, spring-back, buttons, undo, reduced motion (Task 8–9), match overlay + vibrate (Task 9). Testing §4: all four bullets have tasks.
- **Placeholders.** None; every step has code.
- **Type consistency.** `MovieCard` (server) ≡ `MovieNightCard` (client) field-for-field. `PublicState` ≡ `MovieNightState`. `MovieNightMessage` unions identical. Route paths in Task 5 match `api.movieNight` in Task 7. `SwipeCardHandle.fly`, `data-depth`, `data-leaving`, `data-testid="swipe-card"` used consistently across Tasks 8–10.
