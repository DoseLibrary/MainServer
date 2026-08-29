# Dose v2 unified self-hosted application

## Outcome

Replace the separate MainServer and ContentServer topology with one locally
self-hosted Dose application. The application serves the V2 web UI and API,
indexes mounted movie and TV libraries, streams media, and keeps authentication
and playback state for separate family users. PostgreSQL provides durable state
and Docker Compose provides the supported installation path.

## Acceptance criteria

- One Dose service serves the production web UI and versioned API.
- PostgreSQL stores users, sessions, libraries, media metadata, and per-user
  playback state with migrations and database-level constraints.
- An initial setup flow creates the first administrator; administrators can
  manage family users and libraries.
- Host media directories can be mounted read-only and registered using stable
  container paths without persisting host-specific paths.
- Library scanning discovers movies, series, seasons, episodes, audio streams,
  and subtitles without deleting user state during rescans.
- Authenticated users can browse playable media, direct-stream files with HTTP
  range requests, and independently resume or mark items watched.
- Docker Compose starts Dose and PostgreSQL with durable database/config data,
  health checks, documented environment configuration, and no embedded secrets.
- Existing V2 components/pages are retained and wired to the unified API.
- Legacy MainServer/ContentServer behavior is mapped, required capabilities are
  migrated, and the obsolete server-registration/server-picker flow is removed.
- Unit, integration, production-build, and Compose smoke checks pass.

## Constraints

- Keep work on `MainServer` branch `v2`; preserve `master` and legacy repos.
- Do not push, publish, deploy, merge, or destroy user media/data.
- Media mounts are read-only by default; generated artwork/config/transcodes use
  separate writable paths.
- Default to three implementation waves and three review cycles per wave.
- Prefer a modular monolith; do not recreate service boundaries inside Compose.

## Stop conditions

Stop only when the acceptance criteria are evidenced, the autonomy budget is
exhausted, or a product/security decision requires user direction.
