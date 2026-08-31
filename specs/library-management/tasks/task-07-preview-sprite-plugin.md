# Task 07: Scrubber preview sprite plugin

Status: complete

Wave: 3

## Implementation notes

`src/server/sprites.ts` holds `PreviewSpriteStore` + `ffmpegSpriteTools` (single tiled sheet via `fps=1/interval,scale,crop,tile=CxR`). Plugin `src/server/plugins/preview-sprites.ts` (settings: interval, columns, tileWidth, tileHeight, maxTiles) uses the stored `mediaFiles.durationSeconds` to compute tileCount→rows, is idempotent via a `signature` (duration+mtime+layout), and degrades gracefully when ffmpeg is missing (per-file try/catch counts failures). New `media_preview_sprites` table (migration 0013). `catalog.previewSprite(itemId)`; endpoints `GET /media/:id/sprites` (descriptor matching `VideoPlayer.thumbnails`) and `/sprites/sheet` (jpeg). `api.mediaSprites` + Watch passes `thumbnails` to `VideoPlayer` best-effort.

## Description

Generate storyboard sprite sheets for scrubber hover previews as a configurable plugin, and serve them to the `VideoPlayer` `thumbnails` prop.

## Files to Create/Modify

- `src/server/plugins/preview-sprites.ts` (new) + `src/server/plugins/preview-sprites.test.ts`
- `src/server/plugins/registry.ts` (register the plugin)
- `src/server/db/schema.ts` + migration (sprite metadata: per file — columns/rows/interval/tile size/path) or a `mediaPreviewSprites` table
- `src/server/routes.ts` (`GET /api/v1/media/:id/sprites` → sheet + coordinate metadata) + `src/server/routes.test.ts`
- `src/lib/api.ts` (sprite descriptor helper matching `VideoPlayer` `thumbnails` prop shape)

## Technical Details

- Use `ffmpeg` to sample frames at the configured interval and tile them into sprite sheets (settings: interval seconds, tile width/height, columns, quality/format). Preflight ffmpeg; degrade gracefully when absent.
- Persist sprite descriptor (src, columns, rows, interval, tileWidth, tileHeight) so the endpoint returns exactly the shape `VideoPlayer.thumbnails` expects.
- Idempotent: skip files whose sprite matches current settings and file mtime/duration; regenerate on change. Abort on `signal.aborted`.
- Cache sheets locally (e.g. under a `.previews/` dir), served through the local media/image API; keep out of `dist`.

## Acceptance Criteria

- Running the plugin produces a sprite sheet + descriptor for a media file (mocked ffmpeg in tests).
- The sprites endpoint returns a descriptor consumable by `VideoPlayer.thumbnails`; 404 when none.
- Settings drive interval/tile/columns; regeneration is idempotent.
- Missing ffmpeg degrades gracefully.

## Verification

- `bun run test -- preview-sprites`, `bun run test -- routes`
- `bun run build`, `bun run lint`
