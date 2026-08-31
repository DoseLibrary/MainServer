# Task 03: Archive schema and member-facing filtering

Status: complete

Wave: 2

## Description

Add soft-archive state to media items and enforce it on every member-facing read path, so deleted-file titles are hidden from members but retained for admins.

## Files to Create/Modify

- `src/server/db/schema.ts` (add `archivedAt` to `mediaItems`)
- `src/server/migrate.ts` + new migration (e.g. `0007_archive.sql`)
- `src/server/catalog-service.ts` (member reads exclude archived; add admin-inclusive variants where needed)
- `src/server/catalog-service.test.ts`
- `src/server/db/schema.test.ts`

## Technical Details

- Add nullable `archivedAt timestamptz` to `mediaItems`. Availability stays the fast filter; `archivedAt` records when and distinguishes "archived due to missing files" from other unavailability for the admin table.
- Reconciliation (Task 04) sets `available = false` + `archivedAt = now()` when an item loses all available files, and clears both when a file reappears. This task only defines schema + read filtering + a reusable archive/unarchive helper; wiring into the watcher is Task 04.
- Member-facing queries already filter `available = true`; audit home, search, genre, collection, person, details, and recommendations to ensure archived items cannot leak, and add explicit tests.
- Provide admin-facing query support that can include archived items with an `archivedAt` sort key (consumed by Task 08).

## Acceptance Criteria

- Migration applies cleanly on a fresh pglite dev DB and is idempotent to re-run guards.
- No member-facing endpoint returns an item with `available = false`.
- Archive/unarchive helper sets and clears `archivedAt` correctly and rolls up season/series.
- Retained progress/watchlist/metadata rows are untouched by archiving.

## Verification

- `bun run test -- catalog-service` and `bun run test -- schema`
- `bun run build` (drizzle types)
- `bun run lint`
