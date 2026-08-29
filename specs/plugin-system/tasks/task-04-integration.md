# Task 04 — integration, tests, and documentation

Status: pending

## Files to Modify
- `src/routes/CatalogDetails.tsx`
- `docs/setup.md`

## Description
Wire locally stored preferred trailers into catalog details and the existing trailer action. Add end-to-end coverage for persistence, manual runs, scheduled runs, failures, authorization, and local catalog reads. Document internal plugin operation and future import boundary.

## Acceptance Criteria
- Details exposes and launches the preferred trailer when present.
- Catalog reads do not contact TMDB.
- Lint, tests, build, and production verification pass.

