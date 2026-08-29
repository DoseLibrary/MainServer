# Task 04: Offline Enrichment and Artwork Pipeline

Status: complete

Wave: 2

Depends on: Tasks 01-03

## Description

Integrate parsing, provider metadata, relationship persistence, and local artwork caching into scans and explicit metadata refreshes.

## Files to Create/Modify

- `src/server/scanner.ts` (exclusive)
- `src/server/artwork-store.ts` or the existing equivalent (exclusive)
- Pipeline-focused tests owned by this task

## Technical Details

- Enrich parent series/movie items once and season/episode items with their correct provider endpoints.
- Download original poster, backdrop, season, still, collection, and cast profile assets into the local media store using stable content/provider keys.
- Persist all relationships transactionally per item and replace provider-owned relationship sets idempotently.
- Record enrichment version and attempt/success timestamps.
- Preserve prior valid metadata on temporary provider failures and preserve user overrides always.

## Acceptance Criteria

- A repeated scan produces no duplicate metadata or assets.
- One failed lookup/download does not abort unrelated scan items.
- After a successful scan, all catalog artwork references are local paths.
- Explicit refresh can backfill unchanged existing media.

## Verification

- Run scanner/enrichment integration tests
- `bun run test`
- `bun run lint`

