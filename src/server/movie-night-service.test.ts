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
    expect([...ids].sort()).toEqual(['a', 'b', 'c']);
    // Same random source → same order: shuffling is deterministic under test.
    const twin = build(DECK, { random: seeded([0.9, 0.1, 0.5]) });
    const twinCode = (await twin.service.create(host, {})).code;
    expect(twin.service.deck(twinCode).map((c) => c.id)).toEqual(ids);
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
