# Task 06: Local trailer download plugin

Status: not started

Wave: 3

## Description

Extend trailer support from "store the YouTube key" to "download the trailer locally and serve it," honoring offline-first. Builds on the existing `trailer-fetcher` plugin and `mediaTrailers` table.

## Files to Create/Modify

- `src/server/plugins/trailer-fetcher.ts` (download preferred trailer via yt-dlp) + `src/server/plugins/trailer-fetcher.test.ts`
- `src/server/db/schema.ts` + migration (add local file columns to `mediaTrailers`: `localPath`, `downloadedAt`, `status`)
- `src/server/routes.ts` (`GET /api/v1/media/:id/trailer` range-streaming from local file) + `src/server/routes.test.ts`
- `src/lib/api.ts` (trailer URL helper)
- Plugin settings: quality cap, storage dir, languages (reuse existing settings schema pattern)

## Technical Details

- Invoke `yt-dlp` as an external binary (preflight availability; if missing, the plugin reports unavailable and stores metadata only). Abort on `signal.aborted`.
- Download the `preferred` trailer per matched title to a local storage dir; record `localPath` + `downloadedAt` + `status`. Idempotent: skip titles whose local trailer is current.
- Serve the file with HTTP range support and correct content-type; 404 when absent. Reuse the streaming/range helper used for media where practical.
- Keep storage offline-first and out of `dist`/backups noise; never hot-link YouTube at read time.

## Acceptance Criteria

- Running the plugin downloads the preferred trailer to local storage and records the reference (mocked yt-dlp in tests).
- The trailer endpoint streams the local file with range support and 404s when none.
- Missing yt-dlp degrades gracefully; catalog and other plugins unaffected.
- Re-running the plugin does not re-download current trailers.

## Verification

- `bun run test -- trailer-fetcher`, `bun run test -- routes`
- `bun run build`, `bun run lint`
