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
| ffprobe all files | disk seeks, 3-way | **~15–25 min** | ~250 ms/file, `FFPROBE_CONCURRENCY=3` |
| TMDB enrichment | 8 req/s rate limit | **~1.5–2 h** | ~31k API calls (see finding 1) plus ~20k artwork downloads at 4-way |
| **Scan total (first run)** | TMDB | **≈ 2 h** | ingest overlaps enrichment |
| Trailer fetcher | YouTube, sequential | **~5–8 h** | ~1,130 titles × 15–25 s (lookup + 30–100 MB download); ~70 GB stored |
| Subtitle extractor | **library re-read** | **~20–40 h** | demuxing reads the whole container; one ffmpeg pass *per text stream* (finding 3) |
| Preview sprites | **full video decode** | **~1–3 weeks** | `fps=1/10` decodes every frame of ~9,500 h of content, one file at a time (finding 2) |
| Intro detector | partial reads | **~6–11 h** | first 10 min of each episode (~330 MB read) + 226 ms correlation; cached by signature after |
| Subtitle sync | partial reads | **~1–3 h** | only files with sidecars; ~4 s per track (2 s read + 1.7 s search) |

Practical schedule: scan finishes the same afternoon; trailers overnight;
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

## Findings — where the estimates say the code should change

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
