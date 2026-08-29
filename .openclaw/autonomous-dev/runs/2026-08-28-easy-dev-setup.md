# One-command development setup

## Outcome

- `bun run dev` now creates local state, migrates an embedded PGlite database,
  and starts both Fastify and Vite with an API proxy.
- `bun run dev:reset` safely removes only `.dose/` local development state.
- Docker Compose remains backed by PostgreSQL 17.
- Updated development documentation and ignored local state.

## Verification

- Embedded migration smoke: 7 public application tables created.
- `bun run test`: 19 files, 141 tests passed.
- `bun run lint`: passed.
- `bun run verify:production`: passed.

## Review

PASS. Local and production environments share the PostgreSQL dialect and checked-
in migrations, the Vite proxy targets the configurable API port, and reset path
validation prevents deleting outside the repository-local `.dose` directory.
