# Task 08: End-to-end verification and docs

Status: complete

Wave: 5

Depends on: Tasks 01–07

## Description

Prove the mission end to end and document the new user surface.

## Files to Create/Modify

- `src/server/personal-library.e2e.test.ts` (new, offline)
- `src/server/plex-import.test.ts` (mocked Plex; may live with Task 07 — reference here)
- `docs/personal-library.md` (settings, random picker, collection gaps, user
  collections, marathon queue, export/import JSON schema, Plex import + limitations)
- `specs/personal-library/README.md` (flip task status boxes)

## Technical Details

- Offline e2e (network rejected after setup): seed a user + catalog; assert
  settings read/write; random picker returns a matching item and 404s on an
  impossible filter; collection gaps appear only with the setting on and run no
  network; create a user collection and add/remove/reorder; queue two titles and
  assert `next()` advances then stops, skipping an archived one; export watch data,
  clear progress/watchlist/collections, import, and assert the round-trip restores
  state by provider-id match, including unmatched reporting.
- Plex path is covered by a mocked-API test (no live server), asserting mapping,
  writing, and skipped/error reporting.
- Docs cover each workflow, the export JSON schema (§6.1), per-user settings, and the
  Plex import steps and best-effort episode limitation.

## Acceptance Criteria

- Requirements 8.1–8.3.
- Full gates green; e2e passes with network disabled post-setup.

## Verification

- `bun run lint` · `bun run test` · `bun run build` · `bun run verify:production` ·
  `bun audit`
