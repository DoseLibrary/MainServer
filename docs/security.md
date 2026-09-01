# Security posture

An honest assessment of the app as it stands, written after an audit of the
authentication, streaming, download, and admin surfaces. Dose is a home server:
the threat model is a hostile device on your LAN or a port accidentally exposed
to the internet — not a nation state.

## Solid

**Passwords and sessions.** Argon2id with real parameters (64 MB, t=3). Unknown
usernames verify against a dummy hash, so response timing does not reveal which
accounts exist. Session tokens are 32 random bytes and only their SHA-256 is
stored — a stolen database does not yield usable sessions. Cookies are
`httpOnly`, `SameSite=Lax`, and `Secure` in production; `SameSite=Lax` also
blocks cross-site POSTs from carrying the cookie, which is what CSRF needs.
Disabling an account or changing its password revokes its sessions.

**Authorization.** Every member route re-authenticates from the cookie; admin
routes gate on role server-side. Parental limits are enforced in the catalog
layer (`forViewer`) on every read path, including the stream route, the cast
grant, and download creation — not just the UI. Downloads, playback sessions,
device grants, and history are all scoped to their owner in SQL.

**File access.** Streaming resolves paths with `resolveWithin`, which refuses
anything escaping the library root. Library roots themselves are normalized and
`realpath`-checked below `/media` in Docker. Image names, plan codecs, subtitle
keys, and every ffmpeg-bound parameter are validated with allowlists or bounded
schemas before reaching a command line; SQL goes through Drizzle's parameterized
builders throughout.

**Device pairing.** Codes are single-use (consumed in a transaction), short-
lived, rate-limited on polling, and approval requires an existing session.
The unauthenticated cast-stream endpoint uses a 32-byte random token with a
six-hour expiry — required because a Chromecast cannot send cookies.

**Deployment.** Containers run with `no-new-privileges`, media mounts are
read-only, Postgres is not published, and the app now listens on localhost only
with Caddy as the way in.

## Fixed in this pass

| Gap | Fix |
| --- | --- |
| No login throttling — argon2 slows each guess, nothing limited volume | Per-address (20/15 min) and per-account (10/15 min) failure limits with `Retry-After`; a distributed guess against one account is slowed even from rotating addresses; a correct password clears the account, not the noisy address |
| No security headers | CSP (self, plus exactly the Google Cast sender script), `nosniff`, `frame-ancestors 'none'`, same-origin referrers, camera/mic/geolocation denied |
| Throttle blind behind a proxy | `TRUST_PROXY` config: Fastify takes the client address from `X-Forwarded-For`, enabled in compose where Caddy is the only way in |
| Plain HTTP by default | Caddy in compose serves `https://dose.local`; HTTPS is required for the PWA install and offline downloads on iOS, so this was quietly blocking a feature as well |

## Known remaining risks, in honest order

1. **The session cookie is the only factor.** No 2FA. On a LAN this is
   acceptable; if you ever expose Dose to the internet, put it behind a VPN
   (WireGuard/Tailscale) rather than opening 443 to the world.
2. **`style-src 'unsafe-inline'`.** Tailwind and inline style attributes need
   it. Low risk given no user-authored HTML is ever rendered.
3. **Cast tokens are held in memory** and outlive nothing — a restart clears
   them — but within their six hours they are bearer tokens; anyone on the LAN
   who obtains one can stream that one title.
4. **No audit log.** Admin actions (deleting media, changing accounts) leave no
   trail beyond ordinary server logs.
5. **Plugin settings marked secret are encrypted at rest only as much as the
   database is.** Postgres volume access equals secret access.
6. **The `.local` certificate is self-signed.** Devices must trust Caddy's
   local CA once, or click through a warning. A LAN name cannot get a public
   certificate; the alternative is owning a real domain and using DNS-01.

## Reverse proxy: `https://dose.local`

`compose.yaml` now includes Caddy. To use it:

1. Point `dose.local` at the machine running compose — a DNS entry on your
   router, or a `hosts` line on each device: `192.168.x.x dose.local`.
2. `docker compose up -d` and open `https://dose.local`.
3. Trust the certificate once per device (iOS: install the profile Caddy's CA
   provides, or accept the warning). Without a trusted certificate iOS will not
   grant the secure context that installs the PWA and stores downloads.

The app container no longer publishes a LAN port by default; set
`DOSE_PORT=3000` in `.env` to restore direct access for debugging.
