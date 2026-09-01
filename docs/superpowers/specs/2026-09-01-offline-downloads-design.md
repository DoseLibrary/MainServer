# Offline downloads

Take a title on a plane. Downloads are stored on the device and played inside
Dose with no connection, on a phone or tablet.

## Decisions taken during design

| Question | Decision |
| --- | --- |
| What is a download? | Playable inside Dose offline — an installed PWA holding the file itself |
| Target device | Phones and tablets; iOS Safari is the binding constraint |
| Where the file is produced | Encoded on demand; the server keeps a copy only while the transfer is in flight |
| Offline UI | Downloads only. Nothing else pretends to work without a connection |
| Retention | Each download expires after a set time |
| Bulk | A season, or the next N unwatched episodes, with the season's total size shown before committing |
| Storage mechanism | OPFS, range-served by a service worker (approach A) |

## 1. Shape

Four pieces, each usable and testable on its own.

- **`src/server/download-profiles.ts`** — the two profiles and the size estimate,
  as pure functions. Estimates and encode arguments come from the same
  constants, so the number shown and the file produced cannot drift apart.
- **`src/server/download-service.ts`** and a `download_grants` table — one row
  per requested download. Resume and expiry are server truth rather than
  something a device asserts.
- **`src/lib/download-store.ts`** — the OPFS side: incremental writes, range
  reads, listing, deletion, quota. Behind an interface, since jsdom has no OPFS
  and tests use an in-memory implementation.
- **`public/sw.js`** — thin on purpose: cache the app shell, range-serve
  `/offline/<id>` out of OPFS. The byte-slicing is a pure module the worker
  imports, testable without a service worker.

### Flow for one title

1. `POST /api/v1/downloads` creates the grant, starts an encode into a temp
   file, and returns the id, the estimated size, and `expiresAt`.
2. The client polls status while it encodes, then `GET`s with `Range` from its
   own offset. A dropped connection resumes; the server is stateless about it.
3. Each chunk is written straight into OPFS.
4. On the last byte the client `POST`s `/complete` and the server deletes its
   temp file. A sweep catches transfers that never came back.
5. Offline, `<video src="/offline/<id>">` is served by the worker out of OPFS.
   **The player needs no changes**: it is an ordinary URL.

The Downloads screen requires an installed PWA. A plain iOS Safari tab is
evicted after about seven days and gets little quota, so the screen explains how
to install rather than letting someone spend forty minutes on a season the
browser will bin.

## 2. Server

**Profiles.** H.264 High plus AAC stereo in MP4 — what every iPhone plays
without negotiation. `480p ≈ 0.9 Mbps` and `720p ≈ 1.7 Mbps`: a 45-minute
episode is roughly 300 MB or 570 MB, a two-hour film roughly 800 MB or 1.5 GB.

**Encode then serve.** `+faststart` relocates the moov atom after encoding, so
bytes produced mid-encode are not yet a valid file. A grant therefore goes
`preparing → ready` and transfer begins when the file is whole. On a season this
overlaps well: episode two encodes while episode one transfers. The alternative,
fragmented MP4, streams immediately but is less uniformly safe on older iOS, and
this design is pinned to iOS behaving.

**Serving.** A finished file is an ordinary file, so range serving reuses
`resolveRange` from `streaming.ts` and resume comes for free. Encodes run behind
a `Semaphore` capped at two, so a season cannot starve live playback transcodes.

**Grants.** `download_grants`: user, media item, profile, status
(`preparing`/`ready`/`claimed`/`failed`), temp path, byte length, `expiresAt`.
Creation goes through `catalog.forViewer(user.maxMaturityLevel)`, so a
restricted account cannot download what it cannot see — the same gate as
streaming, not a second code path.

**Cleanup.** Temp files live under `CONFIG_PATH/downloads`. A sweep on boot and
hourly removes anything claimed, failed, or expired.

## 3. Client

**Storage.** `download-store.ts` wraps OPFS: `append`, `size`, `readRange`,
`remove`, `list`. Resume uses the actual OPFS file size as its offset rather
than a counter, so a crash cannot leave the two disagreeing.

Everything about a download — title, duration, profile, bytes done, `expiresAt`,
subtitle VTT, and a small poster blob — lives in IndexedDB. The poster matters:
a downloads-only screen without artwork offline looks broken.

**Queue.** Persisted, one active transfer at a time, with pause, resume,
reorder, and retry with backoff. It survives the app being killed: on next open
it re-reads OPFS sizes and continues. Queueing a season expands to its episodes
in broadcast order, so pausing after three is possible.

**Season estimates.** Choosing a season shows the total — the sum of episode
durations times the profile bitrate — beside what the device actually has free
from `navigator.storage.estimate()`. When it will not fit, it says so before
anything starts and offers the smaller profile with its own total. Per-episode
figures sit underneath.

**Install gate.** The screen checks `display-mode: standalone` and calls
`navigator.storage.persist()`, explaining installation when either is missing.

## 4. Offline playback and progress

Playback offline is the existing `VideoPlayer` pointed at `/offline/<id>`. The
service worker answers that path from OPFS with proper `206` responses, because
Safari will not play a video from a `200` without ranges. Subtitles are served
the same way from their stored VTT.

**Progress outbox.** Watching offline records position in an IndexedDB queue —
media item, position, watched flag, timestamp — flushed to
`POST /catalog/items/:id/progress` when the connection returns. Without it,
resume silently lies about everything watched on a plane. On conflict the newer
timestamp wins, which is the same rule the server already applies.

**Expiry on the device.** Each download carries its `expiresAt`. On app open,
anything past it is deleted locally and reported in a single line ("2 downloads
expired"). This works with no connection, since the date travels with the file.

## 5. Failure handling and testing

Failures worth designing for, and the answer to each:

| Failure | Behaviour |
| --- | --- |
| Encode fails | Grant `failed`, queue item shows why, retry available; no partial file survives |
| Transfer interrupted | Resume from the OPFS size on next attempt; no restart |
| Quota exceeded mid-download | Pause the queue, keep what completed, say plainly what will not fit |
| Browser evicts a file | Detected on open (metadata without bytes); the entry is removed and reported, not left broken |
| App killed mid-write | OPFS size is the offset, so the next open resumes cleanly |
| Grant expired server-side | Re-requesting re-encodes; the device copy is unaffected until its own expiry |

**Testing.**

- Pure functions — profiles, size estimates, byte-range slicing — plain unit
  tests, including a season total against known durations.
- `DownloadService` against PGlite, with one real ffmpeg encode of a synthesized
  clip (as `hls.test.ts` already does) to prove the produced file is a valid,
  faststart MP4.
- Routes: authentication, maturity gating, range serving, `complete` deleting
  the temp file, expiry refusing service.
- Client store and queue against the in-memory implementation: resume from a
  partial file, pause and reorder, expiry pruning, quota refusal.
- Offline playback: the range-slicing module directly; the worker itself stays
  too thin to need its own harness.

## Not in scope

Downloads on desktop browsers work by consequence but are not designed for.
There is no background refresh of "next episodes" — iOS cannot be relied on for
it — and no sharing of a downloaded file outside Dose.
