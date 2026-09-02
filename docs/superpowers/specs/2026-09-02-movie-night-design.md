# Movie night

Nobody can agree on a film. The TV shows a QR code, everyone scans it with
their phone, and each person swipes through the same shuffled deck: left for
no, right for yes, a button for maybe. The first title every participant has
said yes to is the match. It lands full-screen on the TV and buzzes every phone.

## Decisions taken during design

| Question | Decision |
| --- | --- |
| Who joins from a phone | Anyone with the QR; nickname only, no Dose account |
| Deck | Host picks filters on the TV first, defaults to the whole movie library; one shuffled order shared by everyone |
| Kinds | Movies only |
| Maybe | Never matches. Used only for the fallback ranking when the deck runs out |
| Notification | In-page: WebSocket push, vibration, full-screen match card. No Web Push |
| Persistence | In memory. A server restart ends every night; nothing is written to the database |
| Swiping | Deck-style: drag with rotation, next cards peek behind, fly-out on release |

## 1. Flow

### TV (signed-in user)

1. "Movie night" in the user menu opens `/movie-night`.
2. **Setup.** Genre, minimum rating, year range, unwatched-only. All empty by
   default. A live count shows how many movies the filters leave.
3. **Start** builds the deck and returns a session code.
4. **Lobby.** Large QR code pointing at `/movie-night/join?code=…`, the code as
   text, the deck size, and the participant list filling in live. The host can
   kick a participant. "Start swiping" enables at two or more participants.
5. **Swiping.** Per-participant progress (cards done / deck size) and a running
   leaders grid: titles with the most yes votes so far. Never who voted what.
6. **Match.** Full-screen card: poster, title, year, rating, overview. Buttons:
   *Play now* (`/watch/:id`), *Keep swiping* (dismisses this match, the night
   continues and can produce another), *End night*.
7. **Fallback.** When every participant has finished the deck and there is no
   undismissed match, the TV shows the top ten titles ranked by yes count then
   maybe count. The host taps one to play.

### Phone (guest)

1. Scan → `/movie-night/join?code=…`. The page asks for a nickname only.
2. **Waiting.** "Waiting for the host…" with the other participants' names.
3. **Deck.** One card at a time. Swipe left = no, right = yes. Buttons below
   for No / Maybe / Yes. Undo returns the last card.
4. **Match.** Push arrives → vibrate, full-screen match card, "Look at the TV".
   If the host keeps swiping the phone returns to where it was in the deck.
5. **Done.** "You're through the deck, waiting on N others."
6. **Ended.** "Night over." The stored token is cleared.

Late joiners are allowed during swiping and start from card 0. The match rule
counts every *current* participant, so a leaver (kicked, or tapped *Leave*) is
removed and the match check re-runs.

The phone keeps its participant token in `localStorage` keyed by session code
so a reload rejoins silently. The TV keeps its session code in
`sessionStorage` so a reload rejoins as host.

## 2. Server

`src/server/movie-night-service.ts` — a state machine over an in-memory map.
No database, no migration.

```
Session {
  code, hostUserId, createdAt, lastActivityAt,
  phase: 'lobby' | 'swiping' | 'ended',
  filters, deck: Card[],
  participants: Map<participantId, { id, nickname, tokenHash, joinedAt }>,
  votes: Map<participantId, Map<cardId, 'yes' | 'no' | 'maybe'>>,
  matches: cardId[],          // in the order found
  dismissed: Set<cardId>,     // host chose "keep swiping"
}
Card { id, title, year?, posterUrl?, rating?, overview?, runtimeMinutes? }
```

### Rules

- **Deck.** Built once at create through `catalog.forViewer(host.maxMaturityLevel)`
  with a new `listMovies(filters)` that shares the `randomItem` clauses and
  adds `unwatchedOnly` (no completed `playback_progress` row for the host).
  Shuffled with an injectable random source (tests pass a seeded one). Capped
  at 500 cards. The deck is a snapshot: catalog changes during the night are
  ignored.
- **Match.** Checked after every vote and every participant removal. A card
  matches when every current participant has voted yes on it and it is not
  already in `matches` or `dismissed`. Only one new match is announced per
  check, in deck order.
- **Fallback ranking.** Yes count descending, then maybe count descending,
  then deck order. Top ten. Available to the TV at any time; shown when every
  participant has voted on every card and no undismissed match exists.
- **Code.** Eight characters from the device-pairing alphabet, shown with a
  dash. Unique among live sessions.
- **Nickname.** Trimmed, 1–24 characters, unique within a session
  case-insensitively (409 otherwise).
- **Participant token.** 32 random bytes, returned once, stored hashed.
- **Limits.** 20 participants per session. One vote per call; a re-vote
  overwrites, undo deletes.
- **Host.** Only the signed-in user who created the session can start, kick,
  dismiss, or end.
- **Lifetime.** A session is dropped six hours after its last activity or on
  `end`. Sweep on every create. Restart wipes everything; the TV's socket
  closes and it shows "Night ended".

### Realtime

One hub per session, following the `RealtimeSocket` shape so tests hand in
fakes. Dedicated endpoint; the existing `/api/v1/events` stays cookie-only and
content-free as its documentation promises.

```
server → everyone   participant.joined { id, nickname }
                    participant.left   { id }
                    phase.changed      { phase }
                    progress           { participantId, done, total }
                    match              { card }
                    match.dismissed    { cardId }
                    ended
server → TV only    leaders            { entries: [{ card, yes, maybe }] }   (throttled, ≤ 1/s)
```

Phones never learn another person's votes. The TV sees aggregates only.

### HTTP — `/api/v1/movie-night`

| Route | Auth | Purpose |
| --- | --- | --- |
| `POST /` | cookie | body = filters → `{ code, joinPath, deckSize }` |
| `GET /count` | cookie | movie count for the filter screen |
| `GET /:code` | cookie or token | phase, participants, deckSize, matches, own vote count |
| `POST /:code/join` | none | `{ nickname }` → `{ participantId, token }` |
| `GET /:code/deck` | token | full card list |
| `PUT /:code/votes/:cardId` | token | `{ vote }` |
| `DELETE /:code/votes/:cardId` | token | undo |
| `DELETE /:code/participants/:id` | host cookie, or the participant's own token | kick or leave |
| `POST /:code/start` | host cookie | lobby → swiping |
| `POST /:code/dismiss/:cardId` | host cookie | keep swiping |
| `POST /:code/end` | host cookie | end the night |
| `GET /:code/leaders` | host cookie | fallback ranking |
| `GET /:code/socket?token=` | host cookie or token | WebSocket |

`join` is unauthenticated, so it is throttled per IP with the `LoginThrottle`
pattern. Unknown codes return 404 without revealing whether one ever existed.

Poster URLs are `/api/v1/images/...`, which is already public, so guest phones
can load them.

## 3. Client

### Routes

- `/movie-night` — TV. Requires a signed-in user. Phases `setup → lobby →
  swiping → match | fallback`.
- `/movie-night/join` — phone. No navbar, full-bleed dark, controls within
  thumb reach.

### Shared

- `src/lib/movie-night.ts` — API calls and `useMovieNightSocket(code, token)`:
  reconnect with backoff like `realtime.ts`, and on every reconnect refetch
  `GET /:code` to resync.
- Types in `api.ts`: `MovieNightCard`, `MovieNightState`, `MovieNightMessage`.

### Phone — `src/components/movie-night/`

- **`SwipeDeck`** renders the top three cards stacked. The cards behind sit at
  `scale(0.95) translateY(12px)` and `scale(0.9) translateY(24px)` and animate
  up into place when the top card leaves.
- **`SwipeCard`** uses pointer events with capture. While dragging:
  `translate(dx, dy) rotate(dx × 0.08deg)` capped at ±18°, transform origin
  bottom-centre so the card pivots as if held at the bottom. A YES stamp
  (green) or NOPE stamp (red) fades in with |dx|. Release beyond 35% of the
  card width, or faster than 0.5 px/ms, flies the card out to `dx × 3` with
  the rotation continuing, 350 ms `cubic-bezier(.2,.8,.2,1)`, then commits the
  vote. Otherwise it springs back with `cubic-bezier(.34,1.56,.64,1)` for a
  slight overshoot. The No / Maybe / Yes buttons trigger the same fly-out
  programmatically; maybe flies upward. Undo brings the last card back in from
  the side it left. `prefers-reduced-motion` replaces motion with fades.
- **Card face.** Poster `object-cover`, gradient at the bottom, title,
  `year · ★ rating · runtime`, overview clamped to three lines, tap to expand.
- **`MatchOverlay`** — full-screen, poster scales in, "It's a match!",
  `navigator.vibrate([100, 50, 100])`.

### TV

- **`MovieNightSetup`** — the filter controls from `RandomPickerModal`
  extracted into a shared `RandomFilterFields` if that is cheap, otherwise a
  small local form; plus the unwatched toggle and the live count.
- **`MovieNightLobby`** — QR through `qrcode` as in `PairDevice`, code text,
  participant chips animating in, Start button, kick affordance.
- **`MovieNightBoard`** — progress per participant, leaders grid, host controls.
- **`MovieNightMatch`** — full-screen match, Play / Keep swiping / End.
- **`MovieNightFallback`** — ranked grid when everyone is done and nothing matched.

Entry point: a "Movie night" item in `UserMenu`. Nothing on the Home page.

## 4. Testing

- `movie-night-service.test.ts` — deck build honours maturity and filters;
  shuffle is deterministic under a seeded random source; nickname uniqueness
  and participant cap; vote → match detection including a late joiner
  blocking an otherwise unanimous card and a leaver unblocking one; dismiss
  then second match; fallback ranking order; TTL sweep; host-only actions.
- Route tests — join throttle, token versus cookie per route, socket auth,
  unknown code is 404.
- `SwipeCard.test.tsx` — pointer sequences produce the expected vote or a
  snap-back; the transform string carries the rotation; undo restores.
- Page tests for `/movie-night` and `/movie-night/join` with a fake socket,
  covering every phase transition and the match overlay.
