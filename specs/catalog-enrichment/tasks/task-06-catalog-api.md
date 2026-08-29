# Task 06: Enriched Catalog API

Status: complete

Wave: 3

Depends on: Tasks 04-05

## Description

Expose enriched metadata through authenticated catalog endpoints with batched queries and local-only recommendation resolution.

## Files to Create/Modify

- `src/server/catalog-service.ts` (exclusive)
- Catalog route modules (exclusive)
- Catalog service/HTTP tests owned by this task

## Technical Details

- Extend home and search shapes with year/runtime, quality, genres/category, and collection label.
- Extend item details with description, dates, tagline, ratings, technical profile, genres, collection, ordered cast, children, and recommendations.
- Resolve recommendations by provider ID to available items in the same accessible library; never serialize remote-only titles.
- Batch-fetch relationship data and image URLs through existing local image helpers.

## Acceptance Criteria

- Responses contain only local image URLs.
- Home/search/details perform a bounded number of queries independent of result count.
- Missing enrichment returns partial valid responses.
- Authentication and library/item access rules remain enforced.

## Verification

- Run catalog service and route tests
- `bun run test`
- `bun run lint`

