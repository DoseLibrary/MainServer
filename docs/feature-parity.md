# Feature parity notes

Where Dose stands against Plex, Jellyfin, Emby, and Netflix — what landed, and
what is still missing. Functionality only: none of this copies their interfaces.

## Landed

| Capability | Notes |
| --- | --- |
| Device pairing by QR | `/pair` on the device, `/link` on the phone. OAuth-device-flow shaped: short user code, secret device code, polling interval, single-use approval. |
| Device management | Profile lists signed-in devices with how they signed in and when they were last used; any but the current one can be revoked. |
| Parental controls | Per-account maturity limit enforced on every member-facing read, including the stream route and cast grants. Unrated titles are withheld from restricted accounts. |
| Now playing | `/admin/activity` shows live sessions with viewer, device, play method, and progress. |
| Watch history | `/profile/history`, built from recorded sessions; per-title removal and a confirmed clear-all. |
| Up next | Countdown card in the closing seconds, with Play now and Cancel; cancelling suppresses the auto-advance. |
| Skip intro | Detected by the `intro-detector` plugin (audio fingerprint correlation across a season). |
| Audio track selection | Dubs and commentary; a non-default track costs a remux, not a re-encode, when its codec is supported. |
| Playback speed | 0.5×–2×, stored with the account. |
| Subtitle appearance | Size and backdrop, stored with the account. |
| Subtitle sync | Sidecar `.srt`/`.vtt` files are imported and re-timed against the audio by the `subtitle-sync` plugin; the player has a manual delay nudge for the rest. |
| Offline downloads | Installed PWA holds titles in OPFS; season queueing with size totals, 30-day expiry, offline playback, progress sync-back. |
| HLS transcode delivery | Seekable VOD segments with a quality ladder (source/720p/480p); remuxes seek via stream restart. |
| Device pairing + management | QR pairing, per-device sessions, revocation. |
| Security baseline | Login throttling, CSP/security headers, HTTPS via bundled Caddy at dose.local. |
| Trailers, scrubber previews, subtitle extraction | Plugins, scheduled and event-driven. |
| Collections, watchlist, marathon queue, watch-data import | See `docs/personal-library.md`. |
| Chromecast remote control | Play/pause, seek, volume, and subtitle switching drive the receiver while casting; local playback resumes where the receiver stopped. The receiver fetches WebVTT through the cast token. |
| Transcoding settings | Admin-tunable encoder preset, CRF quality, thread count, and an HEVC-output preference, applied to HLS segments, progressive re-encodes, and cast streams. |
| Library folder picker | Folder-only browser in the library manager; confined to `/media` in Docker, host drives in native development. |
| Title logo artwork | Admin can pick or clear the transparent title logo used by the hero, alongside poster and backdrop. |
| Link previews | Open Graph and Twitter card tags are injected into the shell for `/media/:id` so a pasted link unfurls with title, overview, and artwork (unauthenticated, ignores maturity limits by design). |
| Details page clock | "Ends at" for what is left of a movie or episode, and the date the title was added. |
| Player gestures | Double-click the picture for fullscreen; single click still toggles playback. |

## Still missing

Roughly in order of value for a self-hosted server:

1. **Live TV and DVR.** Plex, Emby, and Jellyfin all tune HDHomeRun-style
   sources and record to disk. A whole subsystem: tuner discovery, EPG ingest,
   scheduling, and recording.
2. **Subtitle search and download.** OpenSubtitles-style lookup for titles whose
   files carry no usable track. Fits the plugin model directly, but it is the
   first plugin that would need network access as its point. Whatever it fetches
   lands in the same sidecar path the sync plugin already watches, so timing is
   already handled.
3. **TV-friendly navigation.** The web app assumes a pointer; there is no
   D-pad/remote-key navigation, so a TV browser or console is awkward to drive.
4. **Skip credits.** The intro detector already finds shared segments; end
   credits need either chapter metadata or a second detection pass.
5. **Multi-user recommendations.** Recommendation edges come from the provider,
   not from what this household actually watches.
6. **Remote access helper.** No relay or port-mapping assistance; Dose assumes
   the operator arranges reachability.

## Deliberately not pursued

- **Cloud accounts and a central directory.** Dose stays offline-first: accounts
  live on this server, and pairing works without any outside service.
- **Watch-together sessions.** Interesting, but it needs presence and clock sync
  infrastructure that nothing else here would use.
