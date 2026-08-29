# Task 01 — persistence and plugin runtime

Status: complete

## Files to Create
- `src/server/plugins/types.ts`
- `src/server/plugins/registry.ts`
- `src/server/plugin-service.ts`
- generated Drizzle migration

## Files to Modify
- `src/server/db/schema.ts`

## Description
Add plugin configuration and run-history tables, typed plugin contracts, registry, settings validation, concurrency protection, run recording, and unit/integration tests. Do not add a scheduler or concrete plugin yet.

## Acceptance Criteria
- Settings are validated and defaults applied.
- Runs record running/succeeded/failed, timestamps, duration, summary/error.
- Same plugin cannot overlap.
- Unknown plugin IDs are rejected.
