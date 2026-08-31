# Task 10: End-to-end offline verification and docs

Status: done

Wave: 5

Depends on: Tasks 01–09

## Description

Prove the mission end to end offline and document the new operational surface.

## Files to Create/Modify

- `src/server/library-management.e2e.test.ts` (new, offline)
- `docs/setup.md` and/or `docs/library-management.md` (watcher, archiving, re-match, trailers, sprites, categories)
- `specs/library-management/README.md` (flip task status boxes as tasks complete)

## Technical Details

- Offline e2e: seed a temp library, add show + movie files (covering several naming conventions from requirements §1), let reconciliation import them, assert search returns both Movies and Shows groups, delete a file and assert the title archives (hidden to members, visible to admin), re-match an item and assert re-enrichment, and assert trailer/sprite endpoints serve local files (mocked binaries). The test must reject any network access after setup.
- Document: enabling the watcher, archive lifecycle and admin table, TMDB re-match, trailer/sprite plugins and their settings, and required external binaries (yt-dlp, ffmpeg).

## Acceptance Criteria

- The e2e test passes with network disabled post-setup.
- Docs cover every new admin/operator workflow and external dependency.
- Full gates green.

## Verification

- `bun run lint`
- `bun run test`
- `bun run build`
- `bun run verify:production`
- `bun audit`
