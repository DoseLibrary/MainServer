# Task 08: Details, Discovery, and Recommendation UI

Status: complete

Wave: 4

Depends on: Task 07

## Description

Fill the existing catalog surfaces with the enriched information while keeping the established visual language and responsive behavior.

## Files to Create/Modify

- Media details page and its feature components (exclusive)
- Home/catalog/search presentation components that display badges and tags (exclusive)
- UI tests and development gallery fixtures owned by this task

## Technical Details

- Details must present description, year/date, runtime, quality, genres, collection, cast, and local recommendations.
- Home and search cards/dropdown show useful compact metadata: year, runtime/season count, quality badge, category/genres, and collection where space permits.
- Cast uses local profile thumbnails and character labels.
- Recommendations use existing poster/carousel primitives and link only to playable local item routes.
- Mobile layouts prioritize title, year, runtime, and quality before secondary metadata.

## Acceptance Criteria

- All requested enrichment fields are visible on an appropriate production surface.
- Missing fields disappear cleanly without placeholder noise.
- Keyboard navigation, focus visibility, image fallback, and responsive layouts remain accessible.
- Dev fixtures remain isolated from production bundles.

## Verification

- Run focused UI tests
- `bun run test`
- `bun run lint`
- `bun run build`
- `bun run verify:production`

