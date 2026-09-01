# Installing Dose

From an empty machine to a household watching, downloading, and pairing
devices. Every step is here in order; skim the headings if you only need one.

## What you need

- **Docker** with Compose (Docker Desktop on Windows/macOS, `docker` +
  `docker compose` on Linux).
- **Your media on disk**, movies and shows in separate folders. Naming that
  scans well:
  - Movies: `Arrival (2016).mkv` — a title and a year.
  - Shows: `The Wire/Season 01/The Wire S01E01.mkv` — show folder, season
    folder, `SxxEyy` in the file name.
- **A TMDB API token** (free) for artwork and metadata:
  [themoviedb.org](https://www.themoviedb.org) → account → Settings → API →
  *API Read Access Token* (the long v4 one). Without it, scans still index
  files but titles get no artwork or descriptions.

## 1. Configure

```sh
cp .env.example .env
```

Edit `.env`:

| Variable | Set it to |
| --- | --- |
| `POSTGRES_PASSWORD` | A long unique password — letters, numbers, `_`, `-` only |
| `DOSE_MOVIES_PATH` | The host folder holding movies, e.g. `D:/Media/Movies` |
| `DOSE_SHOWS_PATH` | The host folder holding shows |
| `TMDB_API_TOKEN` | The TMDB read-access token |

Windows paths use forward slashes (`D:/Media/Movies`). Media is mounted
read-only — Dose never writes into your library folders.

## 2. Give the server a name

The stack serves `https://dose.local` through its bundled Caddy proxy. Point
that name at the machine running Docker, one of two ways:

- **Router DNS (best)** — add a DNS entry `dose.local → 192.168.x.x` in your
  router's settings. Every device on the network gets it at once.
- **Hosts file (per device)** — add `192.168.x.x  dose.local` to each device's
  hosts file (`C:\Windows\System32\drivers\etc\hosts` on Windows,
  `/etc/hosts` on macOS/Linux; not possible on iOS — use router DNS for
  phones).

Replace `192.168.x.x` with the Docker host's LAN address (`ipconfig` /
`ip addr`).

## 3. Start it

```sh
docker compose up --build -d
```

First build takes a few minutes. Then open **https://dose.local**.

**About the certificate warning:** the proxy signs its own certificate — a LAN
name cannot get a public one. Either accept the warning once per browser, or
trust Caddy's local CA properly (needed for iPhones, see step 7): copy it out
of the container with

```sh
docker compose cp proxy:/data/caddy/pki/authorities/local/root.crt ./dose-ca.crt
```

and install `dose-ca.crt` on each device (Windows: *Trusted Root Certification
Authorities*; iOS: AirDrop/mail the file, install the profile, then enable it
under Settings → General → About → Certificate Trust Settings).

## 4. First run

The first visit shows **Create your administrator** — this account owns the
server. Use a password of at least 10 characters.

Then, from the account menu (avatar, top right) → **Dashboard**:

1. **Libraries** → add one library per media folder: name it, pick
   *Movies* or *Shows*, and use the container path `/media/movies` or
   `/media/shows`.
2. Press **Scan**. Indexing ~1,000 titles takes minutes; metadata and artwork
   follow within the scan. The home page fills in live as titles are enriched.

## 5. The household

Dashboard → **Family accounts**:

- Create one account per person (role *Member*; *Administrator* only for
  people who should manage the server).
- **Can watch** sets a maturity limit per account — a restricted account
  cannot see, search, stream, or download anything above its level, and
  unrated titles are hidden from it too.

Each person signs in on their own devices; watch progress, watch lists,
collections, and history are theirs alone.

## 6. Plugins (all optional, all off by default)

Dashboard → **Plugins**. Enable what you want, give each a schedule (presets
in the field), and press *Run now* for a first pass:

| Plugin | What it does |
| --- | --- |
| Subtitle Extractor | Pulls embedded text subtitles out of your files for the player |
| Subtitle Sync | Imports downloaded `.srt`/`.vtt` sidecars and re-times them against the audio |
| Trailer Fetcher | Downloads trailers for matched titles (needs internet; yt-dlp ships in the container) |
| Scrubber Previews | Generates the thumbnail strip shown when scrubbing |
| Intro Detector | Finds intros across a season so the player can offer Skip intro |
| Seerr | Connects a Seerr / Jellyseerr / Overseerr install so missing collection titles can be requested |

Enabled plugins also react to new files as scans find them; the schedule is
the backstop. Seerr is the exception: it has no schedule, only settings.

### Requesting missing titles

Enrichment knows which parts of a film series you do not have, and shows them
greyed out on a collection page (turn on *Show collection gaps* in profile
settings). With the **Seerr** plugin configured, each of those gets a *Request*
button that hands the title to Seerr, which passes it to Radarr or Sonarr as it
normally would.

Fill in the address Seerr is reachable at *from the Dose container* — usually
`http://seerr:5055` on a shared Docker network, not `localhost` — and the API
key from Seerr → Settings → General. Press **Test connection** to confirm both
before relying on it.

Anyone with an account can request; approval stays in Seerr, so set request
limits and approval rules there if children have accounts here.

## 7. Phones: install the app, pair the TV, take titles offline

- **Install**: open `https://dose.local` in Safari (iOS) or Chrome (Android)
  → Share → **Add to Home Screen**. On iOS this requires the certificate from
  step 3 to be trusted, and it is what lets downloads survive — files in a
  plain browser tab are deleted by the system within about a week.
- **Downloads**: on any movie, season, or episode → **Download**. Pick 480p
  or 720p; the dialog shows the total size (a whole season summed) against
  the space the device has free before anything starts. Downloads live under
  the account menu → **Downloads**, play with no connection, and expire after
  30 days. Progress watched offline syncs back when you reconnect.
- **Pair a TV or console**: on the device open `https://dose.local/pair` — it
  shows a QR code. Scan it with a signed-in phone and approve. Manage every
  signed-in device under Profile → Devices.

## Updating

```sh
git pull
docker compose up --build -d
```

Database migrations run automatically on start.

## Backup

Three named volumes hold everything Dose owns:

| Volume | Contents |
| --- | --- |
| `dose-postgres` | The database: accounts, progress, metadata, settings |
| `dose-config` | Artwork cache, subtitles, trailers, preview sprites |
| `dose-transcode` | Scratch space — no need to back up |

Your media folders are only ever read. Backing up `dose-postgres` and
`dose-config` (e.g. `docker run --rm -v dose-postgres:/data -v $PWD:/backup
alpine tar czf /backup/postgres.tgz /data`) captures the full state.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| `https://dose.local` does not load | The name is not pointing at the Docker host — recheck step 2, and that ports 80/443 are free on the host |
| Transcodes are slow or the CPU is pinned | Check `https://dose.local/admin/transcoding` — if it says software encoding, the GPU is not reaching the container. Uncomment the matching device block in `compose.yaml` |
| Titles have no artwork | `TMDB_API_TOKEN` missing or wrong — `https://dose.local/api/v1/health` reports `metadata.tmdb` |
| A title matched the wrong film | Details page → *Re-match metadata* (admin) and pick the right one |
| Downloads screen says "Install Dose first" | Open the installed Home-Screen app, not a browser tab |
| iPhone refuses to install the app | The certificate is not trusted — finish step 3's iOS instructions |
| Trailer runs fetch nothing | The container needs internet access; check `docker compose logs dose` |
| Direct access for debugging | Set `DOSE_PORT=3000` in `.env` and use `http://localhost:3000` |

More depth: [security posture](security.md) ·
[performance expectations](performance.md) · [metadata behaviour](setup.md).
