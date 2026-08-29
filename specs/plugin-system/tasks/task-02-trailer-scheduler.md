# Task 02 — trailer fetcher and scheduler

Status: pending

## Files to Create
- `src/server/plugins/trailer-fetcher.ts`
- `src/server/plugin-scheduler.ts`

## Files to Modify
- `src/server/db/schema.ts`
- `src/server/tmdb.ts`
- `src/server/catalog-service.ts`
- `src/server/app.ts`

## Description
Add persisted trailer records, a TMDB-by-provider-ID trailer fetcher, registry wiring, and restart-safe cron scheduling. Trailer reads must be local after plugin execution. Add tests.

## Acceptance Criteria
- Stored TMDB IDs are used; title search is never used.
- Preferred official YouTube trailer is selected deterministically while all useful results are retained.
- Scheduler loads enabled plugins on startup, updates next-run state, and prevents overlap.
- Scheduler stops cleanly with the app.

