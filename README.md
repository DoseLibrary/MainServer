# Dose

Dose is a single self-hosted application for a household media library. One
container serves the web interface and API, while PostgreSQL stores shared
catalog data and separate viewing state for each family user.

## Install

Two files in a folder, no clone. The server image is pulled from
`ghcr.io/doselibrary/dose`. The full walkthrough, from an empty machine to a
household watching, downloading to phones, and pairing TVs, is in
**[docs/INSTALL.md](docs/INSTALL.md)**.

You need Docker with Compose 2.23.1 or newer, your movies and shows in two
folders, and a free [TMDB API read-access token](https://www.themoviedb.org/settings/api)
for artwork and metadata.

**1. `.env`** — fill in the password, your media folders, and the token.
Windows paths use forward slashes.

```sh
# Movies and shows, mounted read-only.
DOSE_MOVIES_PATH=D:/Media/Movies
DOSE_SHOWS_PATH=D:/Media/Shows
# Letters, numbers, underscores, and hyphens only.
POSTGRES_PASSWORD=replace-with-a-long-unique-password
# Free TMDB API read-access token (the long v4 one).
TMDB_API_TOKEN=
# Image tag to run: latest, a release like 1.2.3, or sha-<commit>.
DOSE_VERSION=latest
```

**2. `compose.yaml`** — copy as-is. This is the same file the repository ships.

```yaml
# Dose — self-hosted household media server.
#
# Self-contained: this file plus a `.env` next to it is a complete install.
# Nothing else from the repository is needed; the server image is pulled from
# GitHub Container Registry and the proxy config is inlined below.
#
#   docker compose pull && docker compose up -d
#
# Needs Docker Compose 2.23.1 or newer (inline `configs: content:`).

services:
  dose:
    # Published by .github/workflows/docker.yml on every push to v2. Pin a
    # release with DOSE_VERSION=1.2.3 in .env; build from source instead with
    # compose.build.yaml.
    image: ghcr.io/doselibrary/dose:${DOSE_VERSION:-latest}
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      NODE_ENV: production
      HOST: 0.0.0.0
      PORT: 3000
      DATABASE_URL: postgresql://${POSTGRES_USER:-dose}:${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD in .env}@postgres:5432/${POSTGRES_DB:-dose}
      CONFIG_PATH: /config
      TRANSCODE_PATH: /transcode
      TMDB_API_TOKEN: ${TMDB_API_TOKEN:-}
      # The Caddy proxy in this compose is the only way in; trust its
      # X-Forwarded-For so login throttling sees real client addresses.
      TRUST_PROXY: "true"
      # Transcoding: `auto` tests every GPU encoder at startup and uses the
      # fastest that works, `off` forces software, or name one of nvenc / qsv /
      # amf / vaapi / videotoolbox. See docs/performance.md for what it is worth
      # and why HWACCEL_DECODE is off unless the CPU is slow.
      HWACCEL: ${HWACCEL:-auto}
      HWACCEL_DECODE: ${HWACCEL_DECODE:-false}

    # A GPU has to be handed to the container before any of it applies. NVIDIA
    # needs the container toolkit on the host; Intel and AMD need the render
    # node. Uncomment the block that matches this machine.
    # deploy:
    #   resources:
    #     reservations:
    #       devices:
    #         - driver: nvidia
    #           count: 1
    #           capabilities: [gpu, video]
    # devices:
    #   - /dev/dri:/dev/dri   # Intel Quick Sync or AMD VAAPI

    # Reached through the proxy; expose a port directly only if you need to
    # bypass it (DOSE_PORT=3000 restores the old behaviour).
    ports:
      - "${DOSE_PORT:-127.0.0.1:3000}:3000"
    volumes:
      - dose-config:/config
      - dose-transcode:/transcode
      - ${DOSE_MOVIES_PATH:-./media/movies}:/media/movies:ro
      - ${DOSE_SHOWS_PATH:-./media/shows}:/media/shows:ro
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://127.0.0.1:3000/api/v1/health"]
      interval: 10s
      timeout: 3s
      retries: 5
      start_period: 15s
    security_opt:
      - no-new-privileges:true

  postgres:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-dose}
      POSTGRES_USER: ${POSTGRES_USER:-dose}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD in .env}
    volumes:
      - dose-postgres:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
      interval: 5s
      timeout: 3s
      retries: 10
    security_opt:
      - no-new-privileges:true

  proxy:
    image: caddy:2-alpine
    restart: unless-stopped
    depends_on:
      dose:
        condition: service_healthy
    ports:
      - "80:80"
      - "443:443"
    configs:
      - source: caddyfile
        target: /etc/caddy/Caddyfile
    volumes:
      - dose-caddy-data:/data
      - dose-caddy-config:/config
    security_opt:
      - no-new-privileges:true

# Reverse proxy for Dose, serving https://dose.local with a locally generated
# certificate. HTTPS is not cosmetic: installing Dose as an app and holding
# offline downloads both require a secure context on iOS.
#
# Point dose.local at this machine first (router DNS entry, or a hosts line
# on each device). The certificate is Caddy's own local CA: trust it once per
# device or accept the browser warning; a LAN name cannot get a public one.
configs:
  caddyfile:
    content: |
      dose.local {
        tls internal
        encode gzip
        # WebSockets (live catalog updates) are proxied transparently.
        reverse_proxy dose:3000 {
          # Streaming and downloads move gigabytes; never buffer them.
          flush_interval -1
        }
      }

      # Plain HTTP redirects to HTTPS so a typed address still lands somewhere.
      http://dose.local {
        redir https://dose.local{uri} permanent
      }

volumes:
  dose-postgres:
  dose-config:
  dose-transcode:
  dose-caddy-data:
  dose-caddy-config:
```

**3. Point `dose.local` at this machine** — a DNS entry on your router, or a
hosts-file line on each device.

**4. Start it**

```sh
docker compose pull
docker compose up -d
```

Open `https://dose.local`. The first visit creates the administrator account.
Updating is the same two commands again.

The bundled Caddy proxy serves HTTPS with a local certificate — required for
installing Dose as an app and for offline downloads on iOS. The app container
itself listens on localhost only; set `DOSE_PORT=3000` in `.env` if you want
direct access for debugging.

Movies and shows are mounted read-only at `/media/movies` and `/media/shows`.
Dose configuration, temporary transcodes, and PostgreSQL data use the writable
named volumes `dose-config`, `dose-transcode`, and `dose-postgres`. The Dose
container runs database migrations automatically before starting the server.

To run the code from a checkout instead of the published image:

```sh
docker compose -f compose.yaml -f compose.build.yaml up --build -d
```

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
