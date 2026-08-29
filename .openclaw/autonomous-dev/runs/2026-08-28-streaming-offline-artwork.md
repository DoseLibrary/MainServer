# Streaming and offline artwork

## Outcome

- Added authenticated direct byte streaming with HTTP ranges and contained paths.
- Connected playback negotiation to remux/per-track FFmpeg streaming plans.
- Replaced TMDB artwork URLs in catalog payloads with local image endpoints.
- Added scan-time artwork downloads and rescan backfill for unchanged media.

## Verification

- `bun run test`: 18 files, 135 tests passed.
- `bun run lint`: passed.
- `bun run build`: passed.
- `bun run verify:production`: passed; `/dev` gallery excluded.

## Review

PASS. Stream plans are validated before building fixed-argument FFmpeg commands;
media paths are constrained to registered roots; artwork filenames discard path
components. Current transcode output is intentionally limited to fragmented MP4.

## Remaining work

- Wire the frontend player to playback negotiation and returned stream URL.
- Add HLS/session management if adaptive multi-bitrate delivery becomes required.
