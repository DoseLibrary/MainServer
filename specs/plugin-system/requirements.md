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

