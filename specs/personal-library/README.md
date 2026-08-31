# Personal Library

Make Dose personal and portable: bring your history over from Plex, carry your
watch data between Dose installs, see what a collection is missing, build your own
collections and a marathon queue, and get unstuck on movie night with a guided
random picker. Everything member-facing stays offline-first; only Plex import and
the existing metadata/trailer fetch touch the network.

## Scope

- Export a user's watch data (progress, watched state, watchlist, custom
  collections) to a portable JSON file and import it back on any Dose install.
- Import watch history from Plex, Trakt, or Tautulli: matched to local titles and
  written as progress/watched state.
- Show the movies a TMDB collection is missing from the library, as greyed
  placeholders on the collection page — **off by default, a per-user toggle**.
- Let users create, edit, and delete their own named collections and add/remove
  titles.
- Queue titles for a marathon and auto-advance through the queue during playback.
- Pick a random title, optionally narrowed by genre / year / rating / kind, from a
  modal that lands the user on the media info page.
- Establish a persistent per-user settings store surfaced in Profile (the seam the
  Profile entry was added for).

## Explicit Non-Goals

- Two-way Plex sync or writing anything back to Plex; import is one-way, read-only.
- Plex file/database upload as an import source (live server only for now; a file
  fallback can be a later task).
- Per-user star ratings — no ratings model exists yet; ratings are out of export
  scope until that lands.
- Sharing collections/queues between users, or collaborative editing.
- Scheduling/notifications for marathon night (queue is manual playback only).

## Key Decisions (defaults — confirm)

- **External history import is read-only and adapter-based.** Sources plug into one
  import core: Plex server (base URL + token), Trakt (device-code OAuth, ids inline),
  and Tautulli (API key, reaches other Plex Home users' history). Nothing is ever
  written back to any source.
- **Matching is provider-id first.** TMDB id → IMDB id → normalized title + year.
  Unmatched entries are reported, never guessed into the wrong title.
- **Export is portable by natural key, not internal UUIDs.** The export references
  titles by `{tmdbId?, imdbId?, title, year, kind}` so it re-imports on a different
  install. Import is additive and idempotent: progress takes the furthest position
  and OR of watched; watchlist and collection membership union.
- **User collections and the marathon queue are their own tables**, separate from
  the provider `collections` (which are TMDB-scoped with a one-collection-per-item
  unique). A queue is an ordered per-user list with play-next semantics.
- **Collection gaps are stored at enrichment time.** Enrichment records the full
  TMDB collection membership (expected members) so "missing" = expected − present,
  computed locally with no network at view time.
- **Per-user settings live in a typed `user_settings` row.** The collection-gaps
  toggle is the first setting; the store is the home for future preferences.

## Execution Plan

- **Wave 1 — Foundations:** per-user settings store + Profile settings UI; random
  picker (backend + modal).
- **Wave 2 — Collections & completeness:** collection-gap data + gated display;
  user-created collections (schema, CRUD, UI).
- **Wave 3 — Marathon & portability:** marathon queue (schema, endpoints, UI,
  auto-advance); watch-data export/import (portable JSON).
- **Wave 4 — External history:** Plex / Trakt / Tautulli import adapters over the
  shared matching service.
- **Wave 5 — Verification:** end-to-end tests (offline for local features, Plex
  mocked) and docs.

Tasks in the same wave own non-overlapping files where possible and may run in
parallel; overlapping tasks are sequenced within the wave. A wave starts only after
its dependencies pass verification (`bun run lint`, `bun run test`, `bun run build`,
`bun run verify:production`).

## Task Status

- [x] Task 01: Per-user settings store and Profile settings UI
- [x] Task 02: Random picker (backend + modal)
- [x] Task 03: Collection gaps (expected members + gated display)
- [x] Task 04: User-created collections
- [x] Task 05: Marathon queue
- [x] Task 06: Watch-data export/import (portable JSON)
- [x] Task 07: External history import (Plex / Trakt / Tautulli)
- [x] Task 08: End-to-end verification and docs
