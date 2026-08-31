import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '../db/client.ts';
import { libraries, mediaFiles, mediaIntroMarkers, mediaItems } from '../db/schema.ts';
import type { PluginDefinition } from './types.ts';

export const introDetectorSettingsSchema = z.object({
  /** How much of each episode's start is decoded and searched. */
  scanMinutes: z.number().int().min(3).max(20).default(10),
  minIntroSeconds: z.number().int().min(5).max(120).default(20),
  maxIntroSeconds: z.number().int().min(30).max(300).default(150),
  /** Fraction of fingerprint bits that must agree inside the matched window. */
  matchThreshold: z.number().min(0.6).max(0.95).default(0.8),
});

type IntroDetectorSettings = z.infer<typeof introDetectorSettingsSchema>;

/** Mono PCM decoding is the only external dependency, so tests can inject audio. */
export interface IntroAudioTools {
  /** First `maxSeconds` of the file as mono 16-bit PCM at `SAMPLE_RATE`. */
  decode(path: string, maxSeconds: number, signal: AbortSignal): Promise<Int16Array>;
}

export const SAMPLE_RATE = 5512;
/** Fingerprint hop in samples (~93ms) — small enough to place an intro to the second. */
const HOP = 512;
const SECONDS_PER_HOP = HOP / SAMPLE_RATE;

export function ffmpegIntroAudioTools(): IntroAudioTools {
  return {
    decode(path, maxSeconds, signal) {
      return new Promise((resolve, reject) => {
        const child = spawn('ffmpeg', ['-v', 'error', '-i', path, '-t', String(maxSeconds), '-map', '0:a:0', '-ac', '1', '-ar', String(SAMPLE_RATE), '-f', 's16le', '-'], { stdio: ['ignore', 'pipe', 'pipe'] });
        const chunks: Buffer[] = [];
        const stderr: Buffer[] = [];
        const abort = () => child.kill();
        signal.addEventListener('abort', abort, { once: true });
        child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
        child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
        child.once('error', reject);
        child.once('close', (code) => {
          signal.removeEventListener('abort', abort);
          if (signal.aborted) return reject(signal.reason ?? new Error('Intro detection cancelled'));
          if (code !== 0) return reject(new Error(`ffmpeg exited with code ${code}: ${Buffer.concat(stderr).toString().slice(0, 300)}`));
          const buffer = Buffer.concat(chunks);
          resolve(new Int16Array(buffer.buffer, buffer.byteOffset, Math.floor(buffer.byteLength / 2)));
        });
      });
    },
  };
}

/** Smoothing radius (hops) applied to the energy envelope before the delta. */
const SMOOTH_RADIUS = 4;
/** Half-distance (hops) between the two envelope samples each bit compares. */
const DELTA_SPAN = 4;
/** Bit i of a fingerprint describes the envelope around hop i + DELTA_SPAN. */
export const FINGERPRINT_OFFSET_HOPS = DELTA_SPAN;

/** Sign of the smoothed log-energy slope, one bit per hop.
 *
 * The envelope is what episodes of one show share regardless of encode volume,
 * and smoothing plus a wide comparison span keeps the bits stable when the two
 * files' hop grids are misaligned by a fraction of a hop (they always are). */
export function fingerprint(pcm: Int16Array): Uint8Array {
  const hops = Math.floor(pcm.length / HOP);
  if (hops <= 2 * DELTA_SPAN) return new Uint8Array(0);
  const energy = new Float64Array(hops);
  for (let hop = 0; hop < hops; hop++) {
    let sum = 0;
    for (let i = hop * HOP; i < (hop + 1) * HOP; i++) sum += pcm[i] * pcm[i];
    energy[hop] = Math.log1p(sum / HOP);
  }
  const smoothed = new Float64Array(hops);
  for (let hop = 0; hop < hops; hop++) {
    let sum = 0; let count = 0;
    for (let k = Math.max(0, hop - SMOOTH_RADIUS); k <= Math.min(hops - 1, hop + SMOOTH_RADIUS); k++) { sum += energy[k]; count++; }
    smoothed[hop] = sum / count;
  }
  const bits = new Uint8Array(hops - 2 * DELTA_SPAN);
  for (let hop = DELTA_SPAN; hop < hops - DELTA_SPAN; hop++) bits[hop - DELTA_SPAN] = smoothed[hop + DELTA_SPAN] > smoothed[hop - DELTA_SPAN] ? 1 : 0;
  return bits;
}

export type IntroMatch = {
  /** Segment inside fingerprint A, in seconds. */
  aStart: number; aEnd: number;
  /** The same audio inside fingerprint B. */
  bStart: number; bEnd: number;
};

/**
 * Find the longest shared audio segment between two fingerprints.
 *
 * Brute-force over every alignment: for each lag, walk the overlap and keep the
 * longest window whose smoothed bit agreement stays above the threshold. The
 * fingerprints cover only the first few minutes, so N² stays cheap.
 */
export function findSharedSegment(a: Uint8Array, b: Uint8Array, options: { minSeconds: number; maxSeconds: number; threshold: number }): IntroMatch | null {
  const minHops = Math.ceil(options.minSeconds / SECONDS_PER_HOP);
  const SMOOTH = 32; // ~3s agreement window keeps single-bit noise from splitting a run.
  let best: { lag: number; start: number; length: number } | null = null;
  for (let lag = -(b.length - minHops); lag <= a.length - minHops; lag++) {
    const aOffset = Math.max(0, lag);
    const bOffset = Math.max(0, -lag);
    const overlap = Math.min(a.length - aOffset, b.length - bOffset);
    if (overlap < minHops) continue;
    // Rolling agreement over the smoothing window; a run lasts while it stays high.
    let window = 0;
    let runStart = -1;
    for (let i = 0; i < overlap; i++) {
      window += a[aOffset + i] === b[bOffset + i] ? 1 : 0;
      if (i >= SMOOTH) window -= a[aOffset + i - SMOOTH] === b[bOffset + i - SMOOTH] ? 1 : 0;
      const size = Math.min(i + 1, SMOOTH);
      const agree = window / size;
      if (agree >= options.threshold) {
        if (runStart < 0) runStart = Math.max(0, i - size + 1);
        const length = i - runStart + 1;
        if (length >= minHops && (!best || length > best.length)) best = { lag, start: runStart, length };
      } else if (agree < options.threshold - 0.1) {
        runStart = -1;
      }
    }
  }
  if (!best) return null;
  const length = Math.min(best.length, Math.floor(options.maxSeconds / SECONDS_PER_HOP));
  const aStartHop = Math.max(0, best.lag) + best.start + FINGERPRINT_OFFSET_HOPS;
  const bStartHop = Math.max(0, -best.lag) + best.start + FINGERPRINT_OFFSET_HOPS;
  return {
    aStart: aStartHop * SECONDS_PER_HOP,
    aEnd: (aStartHop + length) * SECONDS_PER_HOP,
    bStart: bStartHop * SECONDS_PER_HOP,
    bEnd: (bStartHop + length) * SECONDS_PER_HOP,
  };
}

function signatureOf(modifiedAt: Date, settings: IntroDetectorSettings): string {
  return createHash('sha256')
    .update(`${modifiedAt.getTime()}:${settings.scanMinutes}:${settings.minIntroSeconds}:${settings.maxIntroSeconds}:${settings.matchThreshold}`)
    .digest('hex').slice(0, 32);
}

type EpisodeFile = { fileId: string; absolutePath: string; modifiedAt: Date; episodeNumber: number | null };

export function createIntroDetectorPlugin(database: Database, tools: IntroAudioTools = ffmpegIntroAudioTools()): PluginDefinition<IntroDetectorSettings> {
  /** Episodes of one season, ordered, with playable files. */
  async function seasonEpisodes(seasonId: string): Promise<EpisodeFile[]> {
    const rows = await database.select({
      fileId: mediaFiles.id, relativePath: mediaFiles.relativePath, modifiedAt: mediaFiles.modifiedAt,
      rootPath: libraries.rootPath, episodeNumber: mediaItems.episodeNumber,
    }).from(mediaItems)
      .innerJoin(mediaFiles, and(eq(mediaFiles.mediaItemId, mediaItems.id), eq(mediaFiles.available, true)))
      .innerJoin(libraries, eq(libraries.id, mediaFiles.libraryId))
      .where(and(eq(mediaItems.parentId, seasonId), eq(mediaItems.kind, 'episode')))
      .orderBy(asc(mediaItems.episodeNumber));
    return rows.map((row) => ({ fileId: row.fileId, absolutePath: join(row.rootPath, row.relativePath), modifiedAt: row.modifiedAt, episodeNumber: row.episodeNumber }));
  }

  async function saveMarker(fileId: string, start: number, end: number, signature: string) {
    const values = { mediaFileId: fileId, startSeconds: start, endSeconds: end, signature };
    await database.insert(mediaIntroMarkers).values(values)
      .onConflictDoUpdate({ target: [mediaIntroMarkers.mediaFileId], set: { startSeconds: start, endSeconds: end, signature, updatedAt: new Date() } });
  }

  /** Detect intros for a whole season. Returns how many markers were written. */
  async function detectSeason(seasonId: string, settings: IntroDetectorSettings, signal: AbortSignal): Promise<number> {
    const episodes = await seasonEpisodes(seasonId);
    if (episodes.length < 2) return 0;
    const current = new Map((await database.select({ mediaFileId: mediaIntroMarkers.mediaFileId, signature: mediaIntroMarkers.signature })
      .from(mediaIntroMarkers).where(inArray(mediaIntroMarkers.mediaFileId, episodes.map((episode) => episode.fileId))))
      .map((row) => [row.mediaFileId, row.signature]));
    const pending = episodes.filter((episode) => current.get(episode.fileId) !== signatureOf(episode.modifiedAt, settings));
    if (pending.length === 0) return 0;

    const scanSeconds = settings.scanMinutes * 60;
    const prints = new Map<string, Uint8Array>();
    const printOf = async (episode: EpisodeFile) => {
      const cached = prints.get(episode.fileId);
      if (cached) return cached;
      const print = fingerprint(await tools.decode(episode.absolutePath, scanSeconds, signal));
      prints.set(episode.fileId, print);
      return print;
    };

    let written = 0;
    for (const episode of pending) {
      if (signal.aborted) throw signal.reason ?? new Error('Intro detection cancelled');
      // A pair comparison may already have covered this episode as the partner.
      if (current.get(episode.fileId) === signatureOf(episode.modifiedAt, settings)) continue;
      // Compare against the nearest other episode; the shared segment is the intro.
      const partner = episodes.find((candidate) => candidate.fileId !== episode.fileId);
      if (!partner) continue;
      try {
        const match = findSharedSegment(await printOf(episode), await printOf(partner), {
          minSeconds: settings.minIntroSeconds, maxSeconds: settings.maxIntroSeconds, threshold: settings.matchThreshold,
        });
        if (!match) continue;
        await saveMarker(episode.fileId, round(match.aStart), round(match.aEnd), signatureOf(episode.modifiedAt, settings));
        written++;
        // The partner's segment is known from the same comparison — store it too.
        if (current.get(partner.fileId) !== signatureOf(partner.modifiedAt, settings)) {
          await saveMarker(partner.fileId, round(match.bStart), round(match.bEnd), signatureOf(partner.modifiedAt, settings));
          current.set(partner.fileId, signatureOf(partner.modifiedAt, settings));
          written++;
        }
      } catch (cause) {
        if (signal.aborted) throw cause;
        // A single undecodable file never aborts the season.
      }
    }
    return written;
  }

  return {
    id: 'intro-detector',
    metadata: { name: 'Intro Detector', description: 'Finds shared intro segments across episodes of a season so the player can offer Skip intro.', version: '1.0.0' },
    settingsSchema: introDetectorSettingsSchema,
    fields: [
      { kind: 'number', key: 'scanMinutes', label: 'Minutes scanned per episode', description: 'Audio decoded from the start of each episode when searching for the intro.', min: 3, max: 20, group: 'Detection' },
      { kind: 'number', key: 'minIntroSeconds', label: 'Minimum intro length (s)', min: 5, max: 120, group: 'Detection' },
      { kind: 'number', key: 'maxIntroSeconds', label: 'Maximum intro length (s)', min: 30, max: 300, group: 'Detection' },
      { kind: 'number', key: 'matchThreshold', label: 'Match threshold', description: 'Fraction of the audio fingerprint that must agree (0.6–0.95).', min: 0.6, max: 0.95, step: 0.05, group: 'Detection' },
    ],
    // A freshly ingested episode gets its season analyzed right away; the
    // scheduled sweep below remains the reconciliation backstop.
    events: {
      'media.file.ingested': async ({ payload, settings, signal }) => {
        const [item] = await database.select({ parentId: mediaItems.parentId, kind: mediaItems.kind })
          .from(mediaItems).where(eq(mediaItems.id, payload.mediaItemId)).limit(1);
        if (item?.kind !== 'episode' || !item.parentId) return;
        await detectSeason(item.parentId, settings, signal);
      },
    },
    async run({ settings, signal }) {
      const seasons = await database.select({ id: mediaItems.id }).from(mediaItems).where(eq(mediaItems.kind, 'season'));
      let markers = 0; let failed = 0;
      for (const season of seasons) {
        if (signal.aborted) throw signal.reason ?? new Error('Intro detection cancelled');
        try { markers += await detectSeason(season.id, settings, signal); }
        catch (cause) { if (signal.aborted) throw cause; failed++; }
      }
      return { summary: `Scanned ${seasons.length} seasons, wrote ${markers} intro markers${failed ? `, ${failed} failed` : ''}` };
    },
  };
}

function round(value: number) { return Math.round(value * 10) / 10; }
