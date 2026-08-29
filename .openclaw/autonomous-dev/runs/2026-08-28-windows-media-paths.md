# Native Windows media paths

## Outcome

- Native embedded development accepts absolute Windows library paths.
- Library paths are resolved and checked as accessible directories.
- Docker/production still requires paths contained below `/media`.
- Updated library form guidance for native and Docker modes.

## Verification

- `D:\\Media\\Movies` route and security tests passed.
- `bun run test`: 19 files, 145 tests passed.
- `bun run lint`: passed.
- `bun run verify:production`: passed.

## Review

PASS. Arbitrary host paths are enabled only for development plus embedded PGlite;
production containment and symlink realpath checks remain unchanged.
