# Task 06: Watch-data export/import (portable JSON)

Status: complete

Wave: 3

Depends on: Task 04 (user collections in the payload); relates to Task 01

## Description

Export a user's watch data to portable JSON and import it back on any Dose install.
Provides the matching/import service that Task 07 (Plex) reuses.

## Files to Create/Modify

- `src/server/watch-data-service.ts` (new: export builder, matcher, importer) + test
- `src/server/routes.ts` (`GET/POST /api/v1/me/watch-data`) + `routes.test.ts`
- `src/lib/api.ts` (`exportWatchData`, `importWatchData`, document types)
- `src/routes/Profile.tsx` (export download + import upload in Settings) + test

## Technical Details

- Export document (no internal UUIDs):
  `{ version: 1, exportedAt, progress: [{ match, positionSeconds, watched, lastWatchedAt }],
  watchlist: [{ match }], collections: [{ name, overview?, items: [match] }] }`,
  `match = { tmdbId?, imdbId?, title, year?, kind }`. Builds `match` from
  `media_items.provider_ids.tmdb`, stored external `imdb` id, title, year, kind.
- Matcher `resolveMatch(match) -> mediaItemId | null`: tmdbId → imdbId → normalized
  title+year. Shared, pure-ish, unit-tested against a seeded catalog.
- Import: upsert progress (max `positionSeconds`, OR `watched`, newest
  `lastWatchedAt`), union watchlist, upsert user collections by name and union their
  items. Collect unmatched entries; return `{ matched, written, unmatched: [...] }`.
  Idempotent: re-import is a no-op on state.
- Profile: "Export my data" downloads the JSON; "Import" uploads a file, shows the
  summary (written + unmatched count).

## Acceptance Criteria

- Requirements 6.1–6.5.
- Round-trip: export → wipe → import reproduces progress/watchlist/collections
  (matched by provider id).
- Unmatched entries are reported and never abort the import.

## Verification

- `bun run lint` · `bun run test` · `bun run build` · `bun run verify:production`
