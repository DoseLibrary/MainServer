# Task 07: External history import (Plex / Trakt / Tautulli)

Status: complete

Wave: 4

Depends on: Task 06 (matching/import service)

## Description

Import watch history from an external service so migrating to Dose is easy. One-way,
read-only, and always an explicit user action. The import core is source-agnostic:
every source is an adapter that produces `WatchDataProgressEntry[]`, which the Task 06
importer matches and writes.

## Source Adapters

| Source | Credentials | Ids available | Resume points | Multi-user | Notes |
| --- | --- | --- | --- | --- | --- |
| Plex server | base URL + `X-Plex-Token` | `Guid` tags (`tmdb://`, `imdb://`) inline | `viewOffset` | token owner only | No registration; complete lifetime state |
| Trakt | OAuth device code (client id/secret) | tmdb/imdb/tvdb inline | `/sync/playback` | per Trakt account | Cleanest matching; needs an app registration |
| Tautulli | base URL + API key | needs `get_metadata` per `rating_key` | `view_offset` in history | every Plex Home user | Only history since Tautulli started logging |

Plex and Trakt are the primary adapters. Tautulli is the one that can pull *other*
household members' history, at the cost of an extra metadata call per item and no
pre-Tautulli history.

## Files to Create/Modify

- `src/server/history-sources/types.ts` (new: `HistorySource`, `HistoryEntry`, result shape)
- `src/server/history-sources/plex.ts` (new) + test (mocked fetch)
- `src/server/history-sources/trakt.ts` (new) + test (mocked fetch)
- `src/server/history-sources/tautulli.ts` (new) + test (mocked fetch)
- `src/server/watch-data-service.ts` (import path per source, reusing `importProgress`)
- `src/server/routes.ts` (`POST /api/v1/me/watch-data/import/:source`) + `routes.test.ts`
- `src/lib/api.ts` (`importHistory`, source config types)
- `src/routes/Profile.tsx` (import form per source) + test

## Technical Details

- `HistorySource.read(config)` returns `{ entries: WatchDataProgressEntry[]; errors: string[] }`.
  Bounded concurrency + timeout mirroring `tmdb.ts`; no writes to the source, ever.
- **Plex**: `/library/sections` → movie/show sections → `/library/sections/:id/all`
  with `X-Plex-Token` and `Accept: application/json`. `watched = viewCount > 0`,
  `positionSeconds = round(viewOffset / 1000)`, `lastWatchedAt` from `lastViewedAt`.
  Episode-level GUIDs map to episodes; otherwise series-level state is recorded
  best-effort (documented limitation).
- **Trakt**: device-code OAuth (`/oauth/device/code` → poll `/oauth/device/token`),
  then `/sync/watched/movies`, `/sync/watched/shows`, `/sync/playback`. Ids arrive as
  `{ ids: { tmdb, imdb, tvdb } }`, so matching is provider-id first with no fallback
  needed. Token is used for the request and never persisted beyond the import.
- **Tautulli**: `/api/v2?apikey=…&cmd=get_history&length=…` paged, filtered by
  `user_id` when the caller picks a Plex user (`cmd=get_users`); resolve ids with
  `cmd=get_metadata&rating_key=…`, cached per rating key within one import.
- Every adapter maps to a `match` (§6.3) and reuses `WatchDataService.importProgress`
  for the caller. Response reports `{ matched, written, skipped, errors }`.
- Connection/credential failure → clear 4xx/5xx error, no partial corruption.
- These are the only network paths in the mission; none run during normal browsing.

## Acceptance Criteria

- Requirements 7.1–7.5, generalised: each enabled adapter is driven by a mocked API
  (no real server) and asserts matched/written plus skipped/unmatched reporting, and a
  clean error on connection failure.
- Selecting a source in Profile imports only for the calling user.

## Verification

- `bun run lint` · `bun run test` · `bun run build` · `bun run verify:production`
