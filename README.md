# Dose

Dose is a single self-hosted application for a household media library. One
container serves the web interface and API, while PostgreSQL stores shared
catalog data and separate viewing state for each family user.

## Install

The full walkthrough — from an empty machine to a household watching,
downloading to phones, and pairing TVs — is in **[docs/INSTALL.md](docs/INSTALL.md)**.

The short version:

1. Copy `.env.example` to `.env`; set `POSTGRES_PASSWORD`, your media paths,
   and a TMDB token.
2. Point `dose.local` at this machine (router DNS entry, or a hosts line).
3. `docker compose up --build -d` and open `https://dose.local`.

The bundled Caddy proxy serves HTTPS with a local certificate — required for
installing Dose as an app and for offline downloads on iOS. The app container
itself listens on localhost only; set `DOSE_PORT=3000` in `.env` if you want
direct access for debugging.

Movies and shows are mounted read-only at `/media/movies` and `/media/shows`.
Dose configuration, temporary transcodes, and PostgreSQL data use the writable
named volumes `dose-config`, `dose-transcode`, and `dose-postgres`. The Dose
container runs database migrations automatically before starting the server.

## Development

Install Bun 1.3.10, then run:

```sh
bun install
bun run dev
```

That single command creates an embedded PostgreSQL-compatible PGlite database
under `.dose/`, applies migrations, and starts both the API and Vite UI. Open
`http://localhost:5173`. No Docker or external database is needed for normal UI
and API development. The default development login is `admin` / `admin`.
Override it with `DOSE_DEV_USERNAME` and `DOSE_DEV_PASSWORD` before the first
run if desired. Local data survives restarts; reset it with:

```sh
bun run dev:reset
```

PGlite is used instead of SQLite so development runs the same PostgreSQL schema,
JSONB behavior, constraints, and queries as production. Docker Compose continues
to use PostgreSQL 17.

When running natively, library management accepts absolute host paths such as
`D:\Media\Movies`. Docker deployments continue to require mounted container
paths below `/media`, such as `/media/movies`.

## Metadata and artwork

Dose scans local files without internet access, but fetching posters, backdrops,
overviews, and release metadata during a scan requires a free TMDB API read-
access token. For native development, create `.env.local` containing:

```env
TMDB_API_TOKEN=your_tmdb_api_read_access_token
```

Restart `bun run dev`, then rescan the library. Artwork is downloaded into the
local Dose config store, so browsing and playback remain offline afterward. For
Docker Compose, set the same variable in `.env`.

Verification commands are `bun run lint`, `bun run test`, `bun run build`, and
`bun run verify:production`.
