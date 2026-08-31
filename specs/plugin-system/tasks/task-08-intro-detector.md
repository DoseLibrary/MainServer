# Task 08 — intro detector plugin + skip control

Status: complete

## Files
- `src/server/plugins/intro-detector.ts` (+ test), `src/server/db/schema.ts` (`media_intro_markers`), `drizzle/0018_flippant_justice.sql`
- `src/server/catalog-service.ts` (`introMarker`), `src/server/routes.ts` (`GET /api/v1/media/:id/intro`), `src/lib/api.ts`
- `src/components/media/VideoPlayer.tsx` (`intro` prop, Skip intro button), `src/routes/Watch.tsx`

## Description
First event-driven plugin built on the bus. For each season it decodes the first `scanMinutes` of every episode's audio (ffmpeg → mono 5512 Hz PCM), builds a shift-tolerant fingerprint (smoothed log-energy slope sign, ~93 ms hops), and cross-correlates episode pairs over all alignments. The longest shared run above `matchThreshold` and at least `minIntroSeconds` long is the intro; both episodes' segments are stored in `media_intro_markers` keyed by file with a signature (mtime + settings) so unchanged files are skipped. Reacts to `media.file.ingested` for the affected season; the cron sweep reconciles. The player fetches `GET /media/:id/intro` and shows a "Skip intro" button while playback is inside the segment; clicking seeks to its end.

## Acceptance Criteria
- Synthetic two-episode season: markers written at the true offsets for both files; unrelated audio yields no marker.
- Second sweep with unchanged files decodes nothing and writes nothing.
- Ingest event for one episode analyzes its season.
- Skip intro appears only inside the detected segment, seeks past it, and is absent when no marker exists.
