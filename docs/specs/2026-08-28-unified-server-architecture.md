# Dose v2 — Unified Local Server Architecture

Date: 2026-08-28
Status: Accepted direction; implementation planned

## Product model

A household runs one Dose instance. Browsers and TV clients connect directly to
that instance. An administrator mounts one or more local media directories and
creates family users. Catalog data is shared; identity, preferences, favorites,
and viewing state are private to each user.

The previous browser-mediated route (`client -> MainServer -> client ->
ContentServer`) is removed. The supported route is simply `client -> Dose`.

## Runtime topology

```text
Browser / TV client
        |
        v
Dose container
  - React production assets
  - /api/v1 HTTP API
  - authentication and authorization
  - library scanner and ffprobe integration
  - range streaming and subtitle delivery
        |
        +---- read-only /media/* mounts
        +---- writable /config and /transcode
        |
        v
PostgreSQL container ---- durable database volume
```

Dose is a modular monolith, not a collection of internal network services. Code
is separated by domain so expensive scanning/transcoding work can be moved to a
worker later without changing the public API or data ownership.

## Domain boundaries

- **Identity:** users, password credentials, sessions, roles, preferences.
- **Libraries:** configured roots, scan state, errors, and scheduling.
- **Catalog:** movies, series, seasons, episodes, genres, credits, images.
- **Media:** physical files, probe data, video/audio/subtitle streams.
- **Playback:** authorization, direct play, byte ranges, future transcoding.
- **Personal state:** progress, watched state, favorites, continue watching.

## Storage rules

- PostgreSQL is authoritative for configuration and indexed state.
- Physical media remains authoritative for playable file contents.
- A library stores `/media/movies`, not `D:\\Movies` or `/mnt/nas/movies`.
- Media records store a path relative to their library root.
- Resolution must normalize the path and prove containment beneath the root
  before reading any file.
- Scans use stable library/path identities and upserts so metadata and viewing
  state survive rescans. Missing files are marked unavailable before any purge.
- Flexible ffprobe/provider payloads may be retained in JSONB, while fields used
  for filtering, constraints, or relationships remain typed columns.

## Initial Compose contract

The checked-in example configuration will expose one HTTP port and require the
operator to choose host paths through `.env`:

```dotenv
DOSE_PORT=3000
DOSE_CONFIG_PATH=./data/config
DOSE_TRANSCODE_PATH=./data/transcode
DOSE_MOVIES_PATH=D:/Media/Movies
DOSE_SHOWS_PATH=D:/Media/Shows
```

The Compose file maps these to `/config`, `/transcode`, `/media/movies`, and
`/media/shows`. Database credentials come from environment variables and the
example uses development-safe placeholders rather than checked-in secrets.

## Security baseline

- The setup endpoint is available only while no administrator exists.
- Passwords use a memory-hard password hash; session secrets are random and
  revocable, never stored as plaintext bearer tokens.
- Every media and personal-state route requires an authenticated local user.
- Administrative routes require an administrator role.
- Media paths are identifiers resolved server-side, never arbitrary request
  paths. Range headers and FFmpeg arguments are validated.
- Containers run without unnecessary privileges and media mounts are read-only.

## Migration mapping

The legacy PostgreSQL schemas already demonstrate relational catalog and
per-user progress requirements. They are design evidence, not a schema to copy:
new migrations will fix weak typing, duplicated metadata, plaintext token
storage, and server-registration concepts. Required legacy behaviors will be
tracked explicitly before either old repository is retired.
