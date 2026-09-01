# Performance: a 25 TB library

What a first full pass over ~25 TB costs, phase by phase, on fixed reference
hardware. Estimates are grounded in the actual code paths (concurrency limits,
per-item work) and in measured numbers where the work is CPU-bound JavaScript;
ffmpeg and network figures are engineering estimates for the stated hardware.

## Reference hardware and library shape

| | |
| --- | --- |
| CPU | Intel i7-13700KF (16C/24T) — the analysis numbers below were measured on this chip |
| RAM | 32 GB |
| Library storage | HDD array, ~250 MB/s sustained sequential |
| Internet | 1 Gbit/s (YouTube effectively throttles to ~10–20 MB/s per stream) |
| TMDB | default limits: 8 requests/s, 4 concurrent |
| Library | 1,000 movies (~10 TB, avg 10 GB) + 130 shows / 650 seasons / 10,000 episodes (~15 TB, avg 1.5 GB) = **11,000 files** |

## Measured (this machine)

| Operation | Cost |
| --- | --- |
| Subtitle sync: speech mask, 15 min audio | 11 ms |
| Subtitle sync: full alignment search (±120 s, 7 framerate scales) | **1.7 s** per track |
| Intro detector: fingerprint 2×10 min audio | 14 ms |
| Intro detector: correlate one episode pair | 226 ms |
| Parse a 1,500-cue SRT | 1.6 ms |
| Catalog `home()` with 12k items / 11k files seeded | 76–101 ms |
| Catalog `search()` at that scale | 4–7 ms |
| Catalog `item()` (series with 75 children) | ~10 ms |

The UI stays responsive at this scale; PGlite handles 12k items without
indexes becoming a problem. Analysis math is never the bottleneck — I/O,
ffmpeg decode time, and rate limits are.

## First full pass, phase by phase

| Phase | Bound by | Estimate | Notes |
| --- | --- | --- | --- |
| Discovery (directory walk) | HDD seeks | **< 2 min** | 24-way concurrent readdir |
| ffprobe all files | disk seeks, 6-way | **~8–12 min** | ~250 ms/file, `FFPROBE_CONCURRENCY=6` |
| TMDB enrichment | 8 req/s rate limit | **~6–8 min** | ~3.1k API calls after season batching (see below), plus ~22k artwork downloads at 12-way |
| **Scan total (first run)** | ffprobe + enrichment | **≈ 15–20 min** | ingest overlaps enrichment |
| Trailer fetcher | YouTube, sequential | **~5–8 h** | ~1,130 titles × 15–25 s (lookup + 30–100 MB download); ~70 GB stored |
| Subtitle extractor | **library re-read** | **~20–40 h** | demuxing reads the whole container; one ffmpeg pass *per text stream* (finding 3) |
| Preview sprites | **full video decode** | **~1–3 weeks** | `fps=1/10` decodes every frame of ~9,500 h of content, one file at a time (finding 2) |
| Intro detector | partial reads | **~6–11 h** | first 10 min of each episode (~330 MB read) + 226 ms correlation; cached by signature after |
| Subtitle sync | partial reads | **~1–3 h** | only files with sidecars; ~4 s per track (2 s read + 1.7 s search) |

### Where the enrichment calls went

A first pass over the reference library, by API call:

| Work | Calls before | Calls now |
| --- | --- | --- |
| Movies (search + detail) | 2,000 | 2,000 |
| Collections | ~150 | ~150 |
| Series (search + detail), once per scan | 260 | 260 |
| Seasons | 650 | 650 |
| **Episodes** | **10,000** | **0** — served from the season payload |
| Redundant re-enrichment of unchanged items | ~18,000 | 0 — version-gated |
| **Total** | **~31,000 (~65 min)** | **~3,060 (~6 min)** |

Practical schedule: scan finishes in under half an hour; trailers overnight;
subtitles and intros over a weekend; **sprites are the outlier** and want the
fix below before running against 25 TB.

## Steady state (after the first pass)

- New episode dropped in: watcher scan + event-driven plugins handle one file —
  probe ~0.3 s, enrichment 2–4 TMDB calls, subtitles/intro/sync a few seconds
  each. **Under a minute from file landing to fully processed.**
- Plugin sweeps are signature-gated (sprites, intros, sync) and re-do nothing
  for unchanged files: a nightly sweep over 11k files is minutes of DB checks.
- Playback: direct play is disk+network only. Transcodes on this CPU
  (x264 `veryfast`, 1080p) run ~8–12× realtime each — comfortable headroom for
  **4–6 simultaneous 1080p transcodes**, fewer for 4K HEVC sources (~2).

## Findings — where the estimates said the code should change

All four are now fixed; the table below records what changed and the new cost.

| Finding | Fix | Effect on the 25 TB pass |
| --- | --- | --- |
| Rescans re-enriched everything, series once per episode | Enrichment gated on `enrichmentVersion` + success stamp; one series pass per scan | First scan: ~10k fewer TMDB calls. No-change rescan: **~2 h → ~20 min** |
| Sprites decoded every frame | Per-tile input seeks (4-wide) composed with sharp; measured **~73 ms/tile** | **~1–3 weeks → ~1–2 days** (≈15 s per movie sheet, 2 files in flight) |
| Subtitle extraction read the file once per stream | All wanted streams extracted in one ffmpeg pass | **~20–40 h → ~15–20 h** (one read per file) |
| Plugin sweeps were single-file sequential | `mapPool` worker pools (2–3 wide) in extract/sprites/intro/sync sweeps | Each I/O-bound phase ~2× faster on an array that serves parallel reads |

### Original notes

1. **Rescans re-enrich everything.** `scanner.ingest` calls `enrich()` even for
   unchanged files, and enriches the *series* once per episode file
   (`scanner.ts` ingest path). First scan: ~10k redundant series fetches.
   Every subsequent full scan: another ~31k TMDB calls ≈ 1.5 h, for zero new
   data. Gate enrichment on `enrichmentVersion` + unchanged file, and enrich a
   series once per scan, and a no-change rescan drops from ~2 h to ~20 min.
2. **Sprite generation decodes every frame.** `fps=1/10` samples one frame in
   250 but still decodes all of them. Seeking per tile (`-ss` before `-i`, one
   frame out) or `-skip_frame nokey` + hardware decode turns weeks into
   ~1–4 days for the same output.
3. **Subtitle extraction re-reads the file per stream.** One ffmpeg invocation
   per text stream means a file with three subtitle tracks is read three times.
   Extracting every text stream in a single pass (`-map 0:s:0 out0 -map 0:s:1
   out1 …`) cuts the ~20–40 h phase roughly in half or better.
4. **Plugin sweeps are single-file sequential.** Fine for steady state; for the
   first pass, a small worker pool (2–3 concurrent files, like the scanner's
   ingest pool) would cut the intro/sync/extract phases 2–3× on an array that
   can serve parallel reads.

## Transcode playback vs Plex/Jellyfin

Plex and Jellyfin run one persistent transcoder per playback session that
writes segments ahead of the play head — smooth in steady state, but a seek
tears the session down and restarts it (a multi-second stall), and every
viewer holds a session the server must clean up.

Dose keeps transcode HLS stateless (any segment can be encoded from a cold
start, so seeks are one request with no session to rebuild) and adds:

- **A segment cache** (in-memory LRU, 256 MB, single-flight): a rewind,
  quality switch back, retry, or second viewer of the same title is served
  bytes instead of an encode.
- **Readahead**: serving segment *n* warms *n+1* and *n+2* in a background
  lane, so sequential playback finds every boundary already encoded.
- **First-segment warmup**: the opening segment starts encoding when the
  playback plan is issued, while the client is still fetching playlists —
  time to first frame is the cache read, not the encoder.

Net: seek latency beats the session model, steady-state matches it, and
repeat traffic (the common household case: two people watching the same new
episode) costs one encode instead of two.

## Hardware transcoding

Dose probes for GPU encoders at startup and uses one automatically when it
works. Detection does not trust `ffmpeg -encoders`, which lists everything the
binary was *built* with — a stock build claims NVENC, QSV, AMF and VAAPI on a
machine with no GPU at all. Every candidate instead encodes one real frame with
the exact arguments playback would use, so an encoder that reports as available
will not fail mid-film. `/admin/transcoding` shows the verdict per encoder and
re-runs detection on demand.

Configuration: `HWACCEL` (`auto` by default, `off`, or a pinned family),
`HWACCEL_DEVICE` for the VAAPI render node, `HWACCEL_DECODE` to move decoding
to the GPU as well.

### What it is actually worth

Measured on an i7-13700KF with an RTX 4070 Ti SUPER, encoding to H.264,
wall-clock for the same input (lower is better):

| Workload | Software (x264 veryfast) | NVENC |
|---|---|---|
| 1080p H.264 → 720p, one stream | 4.05 s | 4.23 s |
| 1080p H.264 → 720p, 8 streams | 25.3 s | 27.7 s |
| 4K HEVC → 1080p, one stream | 3.02 s | 2.51 s |
| 4K HEVC → 1080p, 4 streams | 8.62 s | 6.45 s |

Two things follow. **A fast desktop CPU beats NVENC on 1080p H.264** — x264 at
`veryfast` is simply quicker than the fixed-function encoder there, and single
streams of either are decode-bound anyway. **The GPU wins on 4K and on
concurrency**, which is the case that matters: four people watching 4K
remuxes is where a CPU-only server starts dropping frames, and the GPU also
leaves the processor free for scans and sprite generation.

On low-power hardware (N100, NAS boxes, older Xeons) the gap is far wider in
the GPU's favour, since software encoding there cannot sustain real time at all.

### Why decode offload is off by default

`HWACCEL_DECODE` moves decoding onto the GPU too. It sounds like a free win and
is not: decoded frames have to come back across PCIe for filtering, and on a
capable CPU that transfer costs more than the GPU decode saves. Same box, four
concurrent 4K HEVC → 1080p transcodes:

| Pipeline | Wall clock |
|---|---|
| Software decode + NVENC encode (**default**) | 6.45 s |
| Full GPU pipeline (`scale_cuda`, frames never leave the card) | 6.60 s |
| GPU decode → system memory → software scale → NVENC | 6.99 s |
| Everything in software | 8.62 s |

Software decode with a hardware encoder was fastest, and it is also the robust
option: no format mismatches on 10-bit or HDR sources, no filter-graph
surprises. Turn `HWACCEL_DECODE` on when the CPU cannot decode in real time —
that is the case it exists for.
