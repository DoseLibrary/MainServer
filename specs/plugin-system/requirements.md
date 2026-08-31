# Requirements

- Internal plugins are registered by stable ID and expose metadata, a settings schema/defaults, and an async run method.
- Persist enabled state, cron schedule, validated JSON settings, next/last run state, and bounded run history.
- Admins can list plugins, configure settings/schedule, enable or disable, run now, and inspect last success/failure.
- Scheduler survives restarts, prevents overlapping runs of the same plugin, and records duration/error summaries.
- Trailer Fetcher uses stored TMDB provider IDs, fetches current trailer metadata, and stores it locally for catalog reads. A missing provider ID is skipped, not title-rematched.
- Catalog details expose trailers and the existing details UI can play/open the preferred trailer.
- External plugin import is not enabled yet. Runtime interfaces and registry make a later trusted import mechanism possible without changing persistence or admin APIs.
- Only admins may mutate plugin state or start runs. Settings secrets must not be echoed when marked secret.
- PostgreSQL and PGlite use the same migration/schema.

## Events

Core publishes typed domain events that plugins subscribe to by declaring handlers on `events`:
`library.scan.started`, `library.scan.completed`, `media.file.ingested`, `media.item.enriched`,
`media.item.archived`, `media.item.unarchived`, `media.item.removed`, `playback.progress.updated`.

- Delivery is in-memory and fire-and-forget. Events are not persisted and are lost on restart, so a
  plugin that reacts to events must keep a scheduled sweep as its reconciliation backstop.
- `emit` is synchronous, never throws, and is only called after the owning transaction commits.
- A disabled plugin receives nothing. Handler failures are logged, never propagated.
- Handlers of one plugin run serially in emit order; a full per-plugin backlog drops events rather
  than buffering without bound.
