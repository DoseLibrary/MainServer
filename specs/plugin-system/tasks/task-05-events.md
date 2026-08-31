# Task 05 — plugin event bus

Status: complete

## Files to Modify
- `src/server/plugins/events.ts`
- `src/server/plugins/types.ts`
- `src/server/plugin-service.ts`
- `src/server/scanner.ts`, `src/server/enrichment.ts`, `src/server/catalog-service.ts`, `src/server/app.ts`

## Description
Core publishes typed domain events; a plugin subscribes by declaring handlers on `events`. Delivery is in-memory and fire-and-forget: `emit` is synchronous, never throws, and hands work to a per-plugin serial queue with a bounded backlog. Events are lost on restart, so every reacting plugin keeps its scheduled sweep as the reconciliation backstop. `run` is optional, so a plugin may react to events only.

## Event catalog
- `library.scan.started` / `library.scan.completed`
- `media.file.ingested`
- `media.item.enriched`
- `media.item.archived` / `media.item.unarchived` / `media.item.removed`
- `playback.progress.updated`

## Acceptance Criteria
- Events are emitted after the owning transaction commits; a handler that reads the row sees the write.
- Disabled plugins receive nothing; handler failures are logged and never reach the emitter.
- Handlers of one plugin run in emit order; a full backlog drops events instead of buffering without bound.
- Shutdown aborts in-flight runs and handlers through the plugin service's abort signal.
