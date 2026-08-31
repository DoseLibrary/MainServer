# Personal Library — Requirements

Numbered functional requirements. Each is testable; acceptance criteria in the task
files reference these.

## 1. Per-user settings

1.1 A `user_settings` row exists per user (created on demand), holding typed
preferences. First field: `showCollectionGaps` (boolean, default `false`).
1.2 `GET /api/v1/me/settings` returns the caller's settings; `PUT /api/v1/me/settings`
patches them. A member can only read/write their own settings.
1.3 Profile shows a Settings section where the user can toggle "Show missing movies
from collections". The value persists across sessions.
1.4 Deleting a user cascades their settings row.

## 2. Random picker

2.1 `GET /api/v1/catalog/random` returns exactly one top-level, available,
non-archived item (movie or series) the caller can see, or 404 when none match.
2.2 Optional narrowing filters: `kind` (movie|series), `genre` (genre key/name),
`yearMin`, `yearMax`, `ratingMin` (provider rating). Filters combine with AND.
2.3 Selection is uniformly random across the matching set on each call.
2.4 A modal (opened from the navbar) lets the user pick "Surprise me" or set any
subset of filters, then requests a pick and navigates to `/media/:id`.
2.5 With no filters, the pool is the entire visible catalog ("fully random").

## 3. Collection gaps (missing from collection)

3.1 Enrichment records the full TMDB collection membership for any collection it
resolves: each expected member's `tmdbId`, `title`, `year`, `releaseDate`,
`posterPath`, stored so a member absent from the library is still known.
3.2 The collection view returns, only when the caller's `showCollectionGaps` is
`true`, the missing members (expected − present) marked `inLibrary: false`, ordered
by release date alongside present members.
3.3 Missing entries render as greyed, non-navigable placeholders (poster + title +
year) distinct from owned titles. Owned entries are unchanged.
3.4 With the setting off (default), the view is byte-for-byte the current behaviour
(no expected-member queries run).
3.5 Gap computation performs no network calls at view time.

## 4. User-created collections

4.1 Tables: `user_collections` (id, userId, name, overview?) and
`user_collection_items` (userCollectionId, mediaItemId, position, addedAt), each
cascading on user/collection/item delete.
4.2 CRUD: create/rename/delete a collection; add/remove a title; reorder items.
Endpoints under `/api/v1/me/collections`. A user only sees/edits their own.
4.3 A title may belong to many user collections (no global uniqueness like the
provider `collection_members`).
4.4 UI: a "My Collections" area (from Profile) to manage collections; an "Add to
collection" action on the media info page. Archived/unavailable items are hidden
from a collection's presentation but not silently removed from membership.
4.5 Adding a title already present is idempotent (no duplicate row).

## 5. Marathon queue

5.1 Table: `playback_queue` (userId, mediaItemId, position, addedAt), unique on
(userId, mediaItemId).
5.2 Endpoints under `/api/v1/me/queue`: list, add, remove, reorder, clear.
5.3 "Add to queue" is available on the media info page; a queue view shows ordered
items with remove/reorder and a "Start marathon" action.
5.4 Starting a marathon plays the first queued title; on ended, playback advances to
the next queued title (reusing the player's next-item control) until the queue is
exhausted. A watched item is not force-removed from the queue by playback unless the
user removes it.
5.5 Archived/unavailable queued items are skipped during advance and flagged in the
queue view.

## 6. Watch-data export/import (Dose ↔ Dose)

6.1 `GET /api/v1/me/watch-data/export` returns a JSON document:
`{ version, exportedAt, progress: [{ match, positionSeconds, watched, lastWatchedAt }],
watchlist: [{ match }], collections: [{ name, overview?, items: [match] }] }` where
`match = { tmdbId?, imdbId?, title, year?, kind }`. Internal UUIDs never appear.
6.2 `POST /api/v1/me/watch-data/import` accepts that document and applies it to the
caller: upsert progress (furthest `positionSeconds`, OR of `watched`, newest
`lastWatchedAt`), union watchlist, and create/merge user collections by name.
6.3 Matching order: `tmdbId` → `imdbId` → normalized `title` + `year`. Unmatched
entries are collected and returned in the response summary; they never fail the
whole import.
6.4 Import is idempotent: importing the same document twice yields the same state.
6.5 Export/import buttons live in the Profile settings section.

## 7. Plex live-server import

7.1 `POST /api/v1/me/watch-data/import/plex` with `{ baseUrl, token, sections? }`
reads the Plex server's movie/show sections and their watch state.
7.2 For each Plex item, extract watched (`viewCount > 0`), resume
(`viewOffset` ms → seconds), `lastViewedAt`, and provider ids from `Guid` tags
(`tmdb://`, `imdb://`); match to a local item (§6.3 order) and write progress for the
caller.
7.3 The call validates the URL/token and reports counts: matched, written, skipped
(no local match), and errors. A Plex connection failure returns a clear error
without partial corruption.
7.4 Plex import is the only network-touching path here and is an explicit user
action; it never runs during normal browsing.
7.5 Series watch state maps to episodes when episode-level GUIDs are present;
otherwise the series-level state is recorded best-effort (documented limitation).

## 8. Verification and docs

8.1 An offline e2e proves settings, random picker, collection gaps, user
collections, queue advance, and Dose↔Dose export/import round-trip work with the
network disabled after setup.
8.2 A Plex-import test drives a mocked Plex API (no real server) and asserts
matching/writing and the skipped/unmatched reporting.
8.3 Docs cover every new user workflow, the export JSON schema, the per-user
settings, and the Plex import steps/limitations.

## Compatibility / matching notes

- Normalized title = lowercased, trimmed, punctuation/articles folded consistent
  with existing `sort_title` derivation.
- Provider ids come from `media_items.provider_ids` (`tmdb`) and, where stored,
  external ids (`imdb`) captured during enrichment.
- All new member-facing reads exclude archived (`archivedAt`) and unavailable items,
  consistent with existing catalog behaviour.
