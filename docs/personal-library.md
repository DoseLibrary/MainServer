# Personal library — settings, picker, collections, queue, portability

This covers the member surface added by the `personal-library` mission: per-user
settings, the random picker, "missing from collection" placeholders, your own
collections, the marathon queue, and moving watch data in and out of Dose. It
complements [library-management.md](./library-management.md) (operator surface) and
[setup.md](./setup.md) (metadata token and offline guarantees).

Everything here works offline. The only network paths are the external history
importers (Plex / Trakt / Tautulli), which run solely when you press the button.

## Per-user settings

Profile → **Settings** holds preferences that belong to your account, not the
server. The row is created the first time it is read, so nothing to set up.

| Setting | Default | Effect |
| --- | --- | --- |
| Show missing movies from collections | off | Collection pages also list films the library lacks |

`GET /api/v1/me/settings` returns your settings; `PUT` patches them. A member can
only ever read or write their own row, and deleting a user removes it.

## Random picker

The navbar picker answers "what do we watch?". **Surprise me** draws uniformly from
the whole visible catalog; the filters narrow the pool first:

- `kind` — movie or series
- `genre` — any genre name/key in your library
- `yearMin` / `yearMax` — release year range
- `ratingMin` — provider rating floor

Filters combine with AND and the pick lands on `/media/:id`. When nothing matches,
the modal says so and invites you to loosen the filters (the API answers 404).

## Missing from collections

Enrichment records the *full* TMDB collection membership for any collection it
resolves, so Dose knows about films you do not own without asking the network again.
With the Profile setting on, a collection page shows those absent members as greyed,
non-navigable placeholders labelled "Not in library", ordered by release date after
the titles you own.

With the setting off (the default) the collection view is exactly what it was
before: no expected-member query runs at all. Gap computation never touches the
network at view time — posters for absent members were cached during enrichment.

A title you own but have archived still counts as owned, so it is never mislabelled
as missing.

## My Collections

Profile → **My Collections** (`/profile/collections`) manages collections you create:

- Create, rename, delete.
- Add a title from its media page ("Add to collection", including create-new inline).
- Reorder with the up/down controls; remove an item.

A title can belong to any number of your collections, adding it twice is a no-op,
and archived or unavailable titles stay in the collection but are hidden from its
presentation. Collections are private: another user cannot read or change yours
(the API answers 404, never a hint that it exists).

Endpoints live under `/api/v1/me/collections`.

## Marathon queue

Profile → **Marathon queue** (`/profile/queue`) is an ordered list to play straight
through. Add titles from a media page ("Add to queue"), reorder or remove them, then
press **Start marathon**: playback opens the first playable entry with `?queue=1`.

When a title ends in marathon mode, Dose asks the queue for the next playable entry
and plays it; the player's next control does the same on demand. Archived or
unavailable entries are skipped during advance and flagged in the queue view.
Playback never edits your queue — a watched title stays queued until you remove it —
and an exhausted queue simply stops.

Endpoints live under `/api/v1/me/queue` (`GET`, `POST`, `PUT` to reorder, `DELETE`
one or all, and `GET /next?after=<id>`).

## Export and import (Dose ↔ Dose)

Profile → Settings → **Watch data** downloads everything personal as JSON and takes
it back on any install. Titles are referenced by natural key, never by internal
UUID, so a document from one server re-imports on another.

```jsonc
{
  "version": 1,
  "exportedAt": "2026-08-31T18:00:00.000Z",
  "progress": [
    {
      "match": { "tmdbId": "100", "imdbId": "tt100", "title": "The Heist", "year": 2010, "kind": "movie" },
      "positionSeconds": 640,
      "watched": false,
      "lastWatchedAt": "2026-08-30T21:12:00.000Z"
    }
  ],
  "watchlist": [{ "match": { "tmdbId": "101", "title": "The Heist 2", "year": 2014, "kind": "movie" } }],
  "collections": [
    { "name": "Heist night", "overview": null, "items": [{ "tmdbId": "100", "title": "The Heist", "year": 2010, "kind": "movie" }] }
  ]
}
```

`match` is `{ tmdbId?, imdbId?, title, year?, kind }`. Matching runs **TMDB id →
IMDB id → normalized title + year**, where the normalized title is lowercased with
a leading article and punctuation folded away.

Import is additive and idempotent:

- progress keeps the **furthest** position, ORs `watched`, and keeps the newest timestamp
- the watchlist is unioned
- collections merge by name and union their items

Entries with no local match are reported in the summary (`matched`, `written`,
`unmatched`) and never abort the import. Importing the same document twice leaves
the state unchanged.

## Importing history from Plex, Trakt, or Tautulli

Profile → Settings → **Import watch history** reads an external service one way and
writes progress for *you* only. Nothing is ever written back to the source, and the
credentials are used for that one request — they are not stored.

| Source | You provide | Covers | Notes |
| --- | --- | --- | --- |
| **Plex** | server URL + `X-Plex-Token` | the token owner's full lifetime watch state | No registration; movie sections and episode-level show state |
| **Trakt** | client id + access token | everything on the Trakt account | Ids arrive inline, so matching is exact; resume points come from `/sync/playback` |
| **Tautulli** | server URL + API key (+ optional Plex user id) | every Plex Home user's history | Only since Tautulli started logging; one metadata call per rating key |

`POST /api/v1/me/watch-data/import/:source` returns
`{ matched, written, skipped, unmatched, errors }`. Sources are read in full before
anything is written, so a connection or credential failure returns a clear 4xx/5xx
and leaves your data untouched.

### Limitations

- **Plex** exposes only the token owner's state. To bring other household members'
  history over, use Tautulli with their Plex user id.
- **Plex shows** map to episodes when episode-level GUIDs are present; otherwise the
  series-level state is recorded best-effort.
- **Trakt shows** are recorded series-level: per-episode ids would cost one request
  per show. Episode resume points still arrive via `/sync/playback`.
- **Trakt** reports resume as a percentage, converted using the runtime it returns;
  without a runtime the entry lands at position 0 and stays unwatched.
- **Tautulli** has no history from before it was installed, and needs
  `get_metadata` per rating key to learn provider ids (cached per import).

## Where the code lives

| Area | Module |
| --- | --- |
| Settings | `src/server/user-settings-service.ts` |
| Random picker | `CatalogService.randomItem` in `src/server/catalog-service.ts` |
| Collection gaps | `src/server/enrichment.ts` (expected members) + `CatalogService.collection` |
| My Collections | `src/server/user-collections-service.ts`, `src/routes/UserCollections.tsx` |
| Marathon queue | `src/server/queue-service.ts`, `src/routes/Queue.tsx`, `src/routes/Watch.tsx` |
| Export/import + matching | `src/server/watch-data-service.ts` |
| History adapters | `src/server/history-sources/{plex,trakt,tautulli}.ts` |
| Offline proof | `src/server/personal-library.e2e.test.ts` |
