# Task 03: Collection gaps (expected members + gated display)

Status: complete

Wave: 2

Depends on: Task 01 (per-user setting)

## Description

Show what a TMDB collection is missing from the library — greyed placeholders on the
collection page — gated behind the per-user `showCollectionGaps` setting (off by
default).

## Files to Create/Modify

- `src/server/db/schema.ts` + migration (`collection_expected_members`)
- `src/server/enrichment.ts` (persist full TMDB collection membership) +
  `enrichment.test.ts`
- `src/server/tmdb.ts` (ensure collection detail returns all members with
  id/title/year/releaseDate/poster) + `tmdb.test.ts`
- `src/server/catalog-service.ts` (collection detail returns missing members when the
  setting is on) + `catalog-service.test.ts`
- `src/routes/CategoryPage.tsx` or the collection detail view + test

## Technical Details

- `collection_expected_members`: `collectionId` (fk provider `collections`),
  `tmdbId text`, `title`, `year int?`, `releaseDate text?`, `posterPath text?`,
  unique on (collectionId, tmdbId). Written idempotently by enrichment whenever a
  collection resolves, using the TMDB collection's `parts`.
- Catalog collection detail: when caller `showCollectionGaps` is true, compute
  missing = expected members whose `tmdbId` is not among present members'
  `provider_ids.tmdb`; return them marked `inLibrary: false`, ordered by
  `releaseDate`, interleaved/appended with present members. When false, run no
  expected-member query (zero overhead, unchanged payload).
- UI: missing entries render greyed, non-navigable (poster via local image proxy only
  if cached; otherwise a placeholder), labelled "Not in library".

## Acceptance Criteria

- Requirements 3.1–3.5.
- Setting off → identical response/behaviour to today (assert no expected query).
- No network at view time (covered by the offline e2e in Task 08).

## Verification

- `bun run lint` · `bun run test` · `bun run build` · `bun run verify:production`
