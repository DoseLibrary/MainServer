import { describe, expect, it, vi } from 'vitest';
import type { MovieCard } from './catalog-service.ts';
import { MovieNightError, MovieNightService, type MovieNightEvent, type MovieNightOptions } from './movie-night-service.ts';

const card = (id: string): MovieCard => ({ id, title: id.toUpperCase(), year: 2000, rating: 7 });
const DECK = [card('a'), card('b'), card('c')];
const host = { id: 'host-1', maxMaturityLevel: null };

/** A deterministic random source: cycles the given values. */
function seeded(values: number[]) { let i = 0; return () => values[i++ % values.length]; }

function build(deck = DECK, options: MovieNightOptions = {}) {
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
    expect(events[events.length - 1]).toMatchObject({ code, audience: 'all', message: { type: 'participant.joined', participant: { id: ann.participantId, nickname: 'Ann' } } });
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

  it('reports per-participant progress to the host only', async () => {
    const { service } = build();
    const { code } = await service.create(host, {});
    const ann = service.join(code, 'Ann', '1').participantId;
    service.start(code, 'host-1');
    service.vote(code, ann, 'a', 'yes');
    expect(service.state(code, undefined, true).progress).toEqual({ [ann]: 1 });
    expect(service.state(code, ann).progress).toBeUndefined();
    expect(service.state(code).progress).toBeUndefined();
  });

  it('replaces a host own earlier session instead of orphaning it', async () => {
    const { service, events } = build();
    const first = await service.create(host, {});
    const second = await service.create(host, {});
    expect(second.code).not.toBe(first.code);
    expect(events.some((e) => e.code === first.code && e.message.type === 'ended')).toBe(true);
    expect(service.has(first.code)).toBe(false);
    expect(service.has(second.code)).toBe(true);
    // A different host is left alone.
    const other = await service.create({ id: 'host-2', maxMaturityLevel: null }, {});
    expect(service.has(second.code)).toBe(true);
    expect(service.has(other.code)).toBe(true);
  });

  it('rejects a token minted in another session', async () => {
    const { service } = build();
    const a = await service.create(host, {});
    const b = await service.create({ id: 'host-2', maxMaturityLevel: null }, {});
    const ann = service.join(a.code, 'Ann', '1');
    expect(() => service.authenticateParticipant(b.code, ann.token)).toThrow(new MovieNightError('not_found'));
    expect(service.authenticateParticipant(a.code, ann.token)).toMatchObject({ nickname: 'Ann' });
  });

  it('sweeps join records once their window has passed', async () => {
    let clock = 1_000_000;
    const { service } = build(DECK, { now: () => clock });
    const { code } = await service.create(host, {});
    service.join(code, 'Ann', '10.0.9.1');
    const joins = (service as unknown as { joinsByAddress: Map<string, number[]> }).joinsByAddress;
    expect(joins.size).toBe(1);
    service.sweep();
    expect(joins.size).toBe(1);
    clock += 10 * 60 * 1000 + 1;
    service.sweep();
    expect(joins.size).toBe(0);
  });

  it('accepts a code typed without its dash or in lower case', async () => {
    const { service } = build();
    const { code } = await service.create(host, {});
    expect(service.state(code.toLowerCase().replace('-', '')).code).toBe(code);
  });

  it('has() reports existence without throwing, tolerant of dash-less or lower-case form', async () => {
    const { service } = build();
    const { code } = await service.create(host, {});
    expect(service.has(code)).toBe(true);
    expect(service.has(code.toLowerCase().replace('-', ''))).toBe(true);
    expect(service.has('ZZZZ-ZZZZ')).toBe(false);
  });
});

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
    expect(events[events.length - 1]).toMatchObject({ message: { type: 'match', card: { id: 'a' } } });
    expect(events.some((e) => e.message.type === 'participant.left' && e.message.participantId === cat)).toBe(true);
  });

  it('dismissing a match lets the night find the next one', async () => {
    const { service, events, code, ann, bob } = await swipingSession();
    for (const id of ['a', 'b']) { service.vote(code, ann, id, 'yes'); service.vote(code, bob, id, 'yes'); }
    expect(service.state(code).matches.map((c) => c.id)).toEqual(['a']);
    expect(() => service.dismiss(code, 'other', 'a')).toThrow(new MovieNightError('forbidden'));
    service.dismiss(code, 'host-1', 'a');
    expect(events[events.length - 2]?.message).toEqual({ type: 'match.dismissed', cardId: 'a' });
    expect(events[events.length - 1]?.message).toMatchObject({ type: 'match', card: { id: 'b' } });
    expect(service.state(code)).toMatchObject({ matches: [{ id: 'a' }, { id: 'b' }], dismissed: ['a'] });
  });

  it('undo removes a vote and rolls progress back', async () => {
    const { service, events, code, ann } = await swipingSession();
    service.vote(code, ann, 'a', 'yes');
    service.undo(code, ann, 'a');
    expect(service.state(code, ann).votes).toEqual({});
    expect(events[events.length - 1]?.message).toMatchObject({ type: 'progress', participantId: ann, done: 0 });
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

  it('coalesces a burst of leaders emits into one a second', async () => {
    let clock = 1_000_000;
    const timers: Array<{ run: () => void; ms: number }> = [];
    const built = build([card('a'), card('b'), card('c'), card('d'), card('e')], {
      now: () => clock,
      setTimer: (run, ms) => { timers.push({ run, ms }); return timers.length - 1; },
      clearTimer: (handle) => { timers[handle as number] = { run: () => {}, ms: 0 }; },
    });
    const { code } = await built.service.create(host, {});
    const ann = built.service.join(code, 'Ann', '1').participantId;
    built.service.start(code, 'host-1');
    built.events.length = 0;

    for (const id of ['a', 'b', 'c', 'd', 'e']) built.service.vote(code, ann, id, 'yes');
    const leaderEvents = () => built.events.filter((e) => e.message.type === 'leaders');
    // The first vote emits immediately; the other four share one trailing emit.
    expect(leaderEvents()).toHaveLength(1);
    expect(timers).toHaveLength(1);
    clock += 1_000;
    timers[0].run();
    expect(leaderEvents()).toHaveLength(2);
    expect(leaderEvents().length).toBeLessThanOrEqual(2);
    // Ordering still holds: leaders never lands after the progress it belongs to.
    expect(built.events[0]?.message.type).toBe('leaders');
    expect(built.events[1]?.message).toMatchObject({ type: 'progress', done: 1 });
  });

  it('ending removes the session and tells everyone', async () => {
    const { service, events, code } = await swipingSession();
    expect(() => service.end(code, 'other')).toThrow(new MovieNightError('forbidden'));
    service.end(code, 'host-1');
    expect(events[events.length - 1]).toEqual({ code, audience: 'all', message: { type: 'ended' } });
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
    expect(events[events.length - 1]).toEqual({ code, audience: 'all', message: { type: 'ended' } });
  });
});
