# On-demand image variants

## Outcome

- Added Sharp/libvips-backed resizing to the local image endpoint.
- Added width, height, fit, WebP/AVIF/JPEG, and quality options with strict bounds.
- Persisted generated variants and deduplicated concurrent resize requests.
- Preserved the original-image URL behavior when no transform is requested.

## Verification

- `bun run test`: 18 files, 136 tests passed.
- `bun run lint`: passed.
- `bun run build`: passed.
- `bun run verify:production`: passed.

## Review

PASS. Source filenames and transform parameters are bounded, generated paths are
server-derived, originals cannot be enlarged, and repeat requests avoid image
decoding by serving cached files directly.
