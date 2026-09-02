import { randomBytes } from 'node:crypto';
import type { MovieCard, MovieDeckFilters } from './catalog-service.ts';
import { hashSessionToken } from './security.ts';

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
  /** Only when the caller is a participant. */
  votes?: Record<string, Vote>; participantId?: string;
  /** Votes cast per participant. Host only: phones never see the others' progress. */
  progress?: Record<string, number>;
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
  /** Throttle state for the host-only `leaders` feed. */
  leadersEmittedAt: number;
  leadersTimer?: unknown;
}

export const MOVIE_NIGHT_TTL_MS = 6 * 60 * 60 * 1000;
export const MAX_PARTICIPANTS = 20;
export const NICKNAME_MAX = 24;
const JOIN_WINDOW_MS = 10 * 60 * 1000;
const JOINS_PER_ADDRESS = 30;
/** At most one `leaders` frame per session per second: a fast swiper must not flood the TV. */
export const LEADERS_INTERVAL_MS = 1_000;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Accepts a code with or without its dash, in any case. */
export function normalizeCode(value: string): string {
  const bare = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return bare.length === 8 ? `${bare.slice(0, 4)}-${bare.slice(4)}` : bare;
}

export interface MovieNightOptions {
  now?: () => number;
  random?: () => number;
  ttlMs?: number;
  /** Injectable timers so the leaders throttle is testable without wall-clock waits. */
  setTimer?: (run: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export class MovieNightService {
  private readonly sessions = new Map<string, Session>();
  private readonly listeners = new Set<(event: MovieNightEvent) => void>();
  private readonly joinsByAddress = new Map<string, number[]>();
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly ttlMs: number;
  private readonly setTimer: (run: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;

  constructor(private readonly deckSource: DeckSource, options: MovieNightOptions = {}) {
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.ttlMs = options.ttlMs ?? MOVIE_NIGHT_TTL_MS;
    this.setTimer = options.setTimer ?? ((run, ms) => {
      const handle = setTimeout(run, ms);
      // A pending leaders flush must never hold the process open on shutdown.
      (handle as { unref?: () => void }).unref?.();
      return handle;
    });
    this.clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
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
    // One night per host: pressing Create twice replaces the first rather than
    // leaving an orphan session nobody can reach.
    for (const existing of [...this.sessions.values()]) {
      if (existing.hostUserId === host.id) this.discard(existing);
    }
    const code = this.uniqueCode();
    const at = this.now();
    this.sessions.set(code, { code, hostUserId: host.id, createdAt: at, lastActivityAt: at, phase: 'lobby', filters, deck, participants: new Map(), votes: new Map(), matches: [], dismissed: new Set(), leadersEmittedAt: Number.NEGATIVE_INFINITY });
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
    const token = randomBytes(32).toString('hex');
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

  /** Cheap existence check that never throws, for callers that must branch before any auth check. */
  has(code: string): boolean {
    return this.sessions.has(normalizeCode(code));
  }

  state(code: string, participantId?: string, forHost = false): PublicState {
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
    // The TV seeds its progress bars from this, so a reload or a reconnect shows
    // where everyone already is instead of waiting for the next vote.
    if (forHost) {
      state.progress = Object.fromEntries([...session.participants.keys()].map((id) => [id, session.votes.get(id)?.size ?? 0]));
    }
    return state;
  }

  deck(code: string): MovieCard[] {
    return [...this.get(code).deck];
  }

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
    this.queueLeaders(session);
    this.checkMatch(session);
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
    this.discard(this.requireHost(code, hostUserId));
  }

  /** Drop a session, cancel its pending work and tell everyone it is over. */
  private discard(session: Session): void {
    session.phase = 'ended';
    if (session.leadersTimer !== undefined) { this.clearTimer(session.leadersTimer); session.leadersTimer = undefined; }
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
    this.queueLeaders(session);
    this.emit(session.code, 'all', { type: 'progress', participantId, done: session.votes.get(participantId)?.size ?? 0, total: session.deck.length });
    this.checkMatch(session);
  }

  /**
   * Emit `leaders` at most once a second per session: the first change goes out
   * immediately (so the ordering leaders → progress → match still holds), and
   * anything during the following second is coalesced into one trailing emit.
   */
  private queueLeaders(session: Session): void {
    const since = this.now() - session.leadersEmittedAt;
    if (since >= LEADERS_INTERVAL_MS) { this.flushLeaders(session); return; }
    if (session.leadersTimer !== undefined) return;
    session.leadersTimer = this.setTimer(() => {
      session.leadersTimer = undefined;
      if (this.sessions.get(session.code) === session) this.flushLeaders(session);
    }, LEADERS_INTERVAL_MS - since);
  }

  private flushLeaders(session: Session): void {
    session.leadersEmittedAt = this.now();
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

  /** Drop sessions idle past the TTL, and join records past their window. Called on create and by the sweep timer. */
  sweep(): void {
    const cutoff = this.now() - this.ttlMs;
    for (const session of [...this.sessions.values()]) {
      if (session.lastActivityAt < cutoff) this.discard(session);
    }
    // Otherwise one address per join leaks for the lifetime of the process.
    const joinCutoff = this.now() - JOIN_WINDOW_MS;
    for (const [address, timestamps] of this.joinsByAddress) {
      if ((timestamps[timestamps.length - 1] ?? 0) <= joinCutoff) this.joinsByAddress.delete(address);
    }
  }
}
