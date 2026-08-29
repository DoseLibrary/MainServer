# Task 09: Backfill and End-to-End Offline Verification

Status: complete

Wave: 5

Depends on: Tasks 01-08

## Description

Provide a safe enrichment backfill path for existing libraries and verify the complete catalog works after external network access is removed.

## Files to Create/Modify

- Metadata refresh/backfill service and route or admin action (exclusive)
- End-to-end catalog enrichment tests (exclusive)
- Relevant development/setup documentation (exclusive)

## Technical Details

- Allow admin-triggered refresh for a library or item, with progress and actionable failure reporting.
- Backfill based on enrichment version even when media files are unchanged.
- Build an integration fixture, enrich it using deterministic provider responses, then reject outbound network requests.
- Verify home, search, details, cast, collections, recommendations, resized images, and playback planning remain operational offline.

## Acceptance Criteria

- Existing libraries gain new metadata without destructive recreation.
- Refresh is resumable/idempotent and does not erase good metadata on transient failure.
- Offline test proves no provider access occurs in catalog or playback read flows.
- Setup documentation explains token configuration, refresh behavior, and offline guarantees.

## Verification

- `bun run lint`
- `bun run test`
- `bun run build`
- `bun run verify:production`
