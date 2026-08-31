# Task 05: TMDB re-match backend

Status: complete

Wave: 2

## Description

Let admins correct a mistaken match by searching TMDB and reassigning the provider identity, then re-enriching just that item.

## Files to Create/Modify

- `src/server/tmdb.ts` (add a search-titles method if not present) + `src/server/tmdb.test.ts`
- `src/server/catalog-service.ts` or a small `admin-service.ts` (re-match orchestration) + tests
- `src/server/enrichment.ts` (support a user-initiated override that replaces the existing match)
- `src/server/routes.ts` (`GET /api/v1/admin/tmdb/search`, `POST /api/v1/admin/items/:id/match`) + `src/server/routes.test.ts`
- `src/lib/api.ts` (client methods)

## Technical Details

- `GET /api/v1/admin/tmdb/search?type=movie|series&q=` → candidate list (id, title, year, overview, posterPath). Admin only; reuse existing auth guards.
- `POST /api/v1/admin/items/:id/match` `{ tmdbId }` → set `providerIds.tmdb`, flag the item as user-matched, and re-run enrichment for that item overriding the prior automatic match. Bound to a single item; no full scan.
- Respect the offline-first rule: only these admin endpoints hit TMDB; member read paths never do.
- Enrichment override must replace stale genres/cast/collection/artwork for the item without disturbing unrelated items.

## Acceptance Criteria

- Search returns candidates for a query; empty query returns an empty list.
- Re-match reassigns the id, re-enriches only the target item, and the new metadata/artwork is reflected in details.
- Non-admins are rejected. Invalid item/tmdbId returns a clean error.

## Verification

- `bun run test -- tmdb`, `bun run test -- routes`, `bun run test -- enrichment`
- `bun run lint`
