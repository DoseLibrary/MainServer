# Task 07: Frontend Enrichment Contracts and Data Wiring

Status: complete

Wave: 3

Depends on: Task 06

## Description

Add typed client contracts and map enriched backend responses into the existing home, search, and detail view models.

## Files to Create/Modify

- Frontend API client and catalog query modules (exclusive)
- Frontend API mapping tests owned by this task

## Technical Details

- Model optional genres, collection, cast, recommendations, technical quality, descriptions, dates, and local artwork URLs.
- Keep transport DTOs separate from reusable presentational component props.
- Preserve loading, error, empty, and partial-metadata states.
- Do not add any TMDB URL construction or browser-side provider calls.

## Acceptance Criteria

- Production routes use backend data rather than development fixtures.
- Image size parameters match actual UI slots and use the local image API.
- Partial enrichment does not break route rendering.
- No provider hostname appears in production client output.

## Verification

- Run frontend API/mapping tests
- `bun run lint`
- `bun run build`

