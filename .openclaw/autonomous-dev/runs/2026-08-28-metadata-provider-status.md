# Metadata provider diagnosis and recovery

## Evidence

- Local database contained 4 scanned files/items, 0 enriched items, 0 posters.
- No TMDB token was present in process or development env files.

## Outcome

- Added clear startup warning and health/admin provider status.
- Documented `.env.local` and Compose TMDB token setup.
- Passed the token into Docker Compose without requiring it.
- Rescans now enrich unchanged files after metadata is configured.

## Verification

- `bun run test`: 19 files, 146 tests passed.
- `bun run lint`: passed.
- `bun run verify:production`: passed.

## Review

PASS. No credentials are logged or stored in the database; empty optional tokens
remain valid, and metadata failures do not prevent local file discovery.
