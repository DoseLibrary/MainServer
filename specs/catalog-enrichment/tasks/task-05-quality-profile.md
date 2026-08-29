# Task 05: Technical Media Profile and Quality Badges

Status: complete

Wave: 2

Depends on: Task 02

## Description

Derive and persist stable display-quality metadata from ffprobe output during scanning.

## Files to Create/Modify

- `src/server/media-quality.ts` (exclusive)
- `src/server/media-quality.test.ts` (exclusive)
- The ffprobe mapping module, if separate from `scanner.ts` (exclusive; coordinate contract with Task 04)

## Technical Details

- Map dimensions to deterministic `8K`, `4K`, `1440p`, `1080p`, `720p`, or `SD` labels.
- Detect HDR variants from color transfer/primaries/side data where reliable and otherwise report SDR/unknown conservatively.
- Normalize video codec, audio codec, channel layout, and bitrate.
- Expose a small serializable technical profile consumed by playback negotiation and catalog serializers.

## Acceptance Criteria

- Table-driven tests cover common H.264, HEVC/HDR, AV1, multichannel audio, absent fields, and malformed probes.
- Quality is derived during scan/refresh, never by spawning ffprobe in a catalog request.
- Playback negotiation can continue consuming the stored probe without regression.

## Verification

- `bun run test -- media-quality playback`
- `bun run lint`

