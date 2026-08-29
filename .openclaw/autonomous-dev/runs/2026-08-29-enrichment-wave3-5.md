# Catalog enrichment — Waves 3-5 (complete)

Date: 2026-08-29

## Outcome

Completed the catalog-enrichment mission. All 9 tasks done.

- Task 06 (enriched API): `catalog-service` batches quality/genres/collection for home+search and full details (tagline, ratings, quality profile, ordered cast with local profile images, local-resolved recommendations). Bounded queries, local image URLs only. `catalog-service.test.ts`.
- Task 07 (frontend contracts): `api.ts` gained `CatalogItemDetails`, `CatalogQuality`, `CatalogCastMember`, `CatalogCollection`, `CatalogGenre`; list items gained badge/genres/collection; `catalogItem()` returns details; Watch/CatalogDetails retyped. `imageVariant` stays local-only. `api.test.ts`.
- Task 08 (enriched UI): CatalogDetails maps quality badge + content rating chips, runtime/rating/genres/collection metadata line, tagline, cast row (local thumbnails + character), recommendation carousel. Home cards + navbar search show quality badge and lead genre. `CatalogDetails.test.tsx`.
- Task 09 (backfill + offline): `ScanCoordinator.refreshLibrary(libraryId, force)` re-enriches existing titles without touching files, enrichment-version-gated; `POST /api/v1/libraries/:id/refresh` (admin) + `api.refreshLibraryMetadata` + LibraryManager "Refresh metadata" button. `enrichment-offline.test.ts` rejects network after enrichment and proves home/search/details/recommendations/playback planning work offline. `docs/setup.md` covers token, refresh, offline guarantees.

## Verification

- `bun run lint` clean
- `bun run test` — 185 passed (26 files)
- `bun run build` green (server tsc + client)
- `bun run verify:production` — fixtures excluded from bundle

## Remaining risks / manual

- Refresh re-searches TMDB by title (uses existing find()); precise refresh by stored provider id is a possible future optimization.
- Recommendation edges resolve at enrich time to items already present; a title added later links on its own next enrich/refresh (idempotent).
- No commits/pushes (autonomy budget: no VCS mutations without explicit request).
