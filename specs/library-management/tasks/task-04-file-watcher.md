# Task 04: Library filesystem watcher and reconciliation

Status: complete

Wave: 2

Depends on: Task 03 (archive helper/semantics)

## Description

Watch library roots and reconcile the catalog automatically: newly added files are scanned and enriched; deleted files archive their titles.

## Files to Create/Modify

- `src/server/library-watcher.ts` (new) + `src/server/library-watcher.test.ts` (new)
- `src/server/scanner.ts` (expose a targeted reconcile/scan entry the watcher can call; keep full-scan intact)
- `src/server/app.ts` (start/stop watcher with the server lifecycle, behind config)
- `src/server/config.ts` + `src/server/config.test.ts` (watch enable flag, debounce interval)

## Technical Details

- Use a maintained watcher (prefer `chokidar` if already a dependency; otherwise justify `node:fs.watch` with recursive support and document platform caveats on Windows/Linux). Do a dependency preflight before adding anything new.
- Filter to `VIDEO_EXTENSIONS`. Debounce and coalesce bursts so a batch of changes triggers at most one incremental pass per library per window.
- Add/modify → existing incremental scan+enrich for that library. Delete/rename-away → reconcile: mark missing `mediaFiles.available = false` and archive items with no remaining available files via the Task 03 helper.
- Watcher failures are logged and isolated; they never crash the server. The periodic full scan remains the backstop.
- Provide a config flag to disable watching (tests and headless environments run with it off).

## Acceptance Criteria

- Adding a recognized file under a watched root results in a scanned, enriched, member-visible item (verified via a temp dir + fake clock/debounce in tests).
- Deleting the last file of a title archives it: hidden from members, present for admins with `archivedAt` set.
- Rapid change bursts collapse into a single scan pass.
- Watcher errors do not crash the app; disabled flag fully stops watching.

## Verification

- `bun run test -- library-watcher` and `bun run test -- scanner`
- `bun run lint`
