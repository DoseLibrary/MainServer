import { readdir, readFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '../db/client.ts';
import { libraries, mediaFiles, mediaSubtitles } from '../db/schema.ts';
import type { SubtitleStore } from '../subtitles.ts';
import { ffmpegAudioDecoder, PCM_SAMPLE_RATE, type AudioDecoder } from '../audio-pcm.ts';
import { applyAlignment, findAlignment, parseSubtitles, serializeVtt, speechMask, type Alignment } from '../subtitle-sync.ts';
import type { PluginDefinition } from './types.ts';

export const subtitleSyncSettingsSchema = z.object({
  /** How far a subtitle may be shifted before the result is rejected. */
  maxOffsetSeconds: z.number().int().min(5).max(600).default(120),
  /** Minutes of audio analyzed; more is slower but steadier on sparse dialogue. */
  analyzeMinutes: z.number().int().min(2).max(60).default(15),
  /** Alignments below this agreement are recorded but not applied. */
  minConfidence: z.number().min(0.3).max(0.99).default(0.6),
  correctFramerate: z.boolean().default(true),
  /** Also check subtitles extracted from the file itself, not just sidecars. */
  includeEmbedded: z.boolean().default(false),
});

type SubtitleSyncSettings = z.infer<typeof subtitleSyncSettingsSchema>;

const SIDECAR_EXTENSIONS = ['.srt', '.vtt'];
/** Sidecars get negative stream indices; embedded tracks use ffmpeg's own (>= 0). */
const SIDECAR_INDEX_BASE = -1;

/** `Movie.en.forced.srt` → language `en`, forced. The stem must match the video. */
export function describeSidecar(videoFile: string, subtitleFile: string): { language?: string; forced: boolean; label: string } | null {
  const stem = basename(videoFile).replace(/\.[^.]+$/, '');
  const name = basename(subtitleFile);
  const extension = SIDECAR_EXTENSIONS.find((candidate) => name.toLowerCase().endsWith(candidate));
  if (!extension) return null;
  const withoutExtension = name.slice(0, -extension.length);
  if (withoutExtension.toLowerCase() !== stem.toLowerCase() && !withoutExtension.toLowerCase().startsWith(`${stem.toLowerCase()}.`)) return null;
  const tags = withoutExtension.slice(stem.length).split('.').filter(Boolean);
  const forced = tags.some((tag) => tag.toLowerCase() === 'forced');
  const language = tags.find((tag) => /^[a-z]{2,3}$/i.test(tag) && tag.toLowerCase() !== 'sdh')?.toLowerCase();
  const label = [language?.toUpperCase() ?? 'External', forced ? 'Forced' : undefined].filter(Boolean).join(' · ');
  return { language, forced, label };
}

type FileRow = { id: string; relativePath: string; rootPath: string };

/**
 * Keeps subtitle timing honest.
 *
 * Downloaded subtitles are routinely timed against another release: a few
 * seconds out, or drifting because they were made for a PAL transfer. This
 * plugin imports sidecar files dropped next to a video, measures each track
 * against the audio, and rewrites the stored WebVTT so it lines up.
 */
export function createSubtitleSyncPlugin(
  database: Database,
  store: SubtitleStore,
  decoder: AudioDecoder = ffmpegAudioDecoder(),
): PluginDefinition<SubtitleSyncSettings> {
  async function filesWithLibrary(fileId?: string): Promise<FileRow[]> {
    const rows = await database.select({ id: mediaFiles.id, relativePath: mediaFiles.relativePath, rootPath: libraries.rootPath })
      .from(mediaFiles).innerJoin(libraries, eq(libraries.id, mediaFiles.libraryId))
      .where(fileId ? and(eq(mediaFiles.id, fileId), eq(mediaFiles.available, true)) : eq(mediaFiles.available, true));
    return rows;
  }

  /** Import any sidecar next to the video that is not stored yet. */
  async function importSidecars(file: FileRow): Promise<number> {
    const absolute = join(file.rootPath, file.relativePath);
    const folder = dirname(absolute);
    let entries: string[];
    try { entries = await readdir(folder); } catch { return 0; }

    const existing = await database.select({ streamIndex: mediaSubtitles.streamIndex, sourcePath: mediaSubtitles.sourcePath })
      .from(mediaSubtitles).where(eq(mediaSubtitles.mediaFileId, file.id));
    const known = new Set(existing.map((row) => row.sourcePath).filter(Boolean) as string[]);
    let nextIndex = Math.min(SIDECAR_INDEX_BASE, ...existing.map((row) => row.streamIndex - 1));

    let imported = 0;
    for (const entry of entries.sort()) {
      const described = describeSidecar(absolute, entry);
      if (!described || known.has(entry)) continue;
      let cues;
      try { cues = parseSubtitles(await readFile(join(folder, entry), 'utf8')); } catch { continue; }
      if (cues.length === 0) continue;
      const streamIndex = nextIndex--;
      const key = `${file.id}.${Math.abs(streamIndex)}.external.vtt`;
      await store.ensureDir();
      await store.write(key, serializeVtt(cues));
      await database.insert(mediaSubtitles).values({
        mediaFileId: file.id, streamIndex, language: described.language, label: described.label,
        forced: described.forced, storageKey: key, source: 'external', sourcePath: entry,
      }).onConflictDoNothing();
      imported++;
    }
    return imported;
  }

  /** Measure one track against the audio and rewrite it when the fit is good. */
  async function syncTrack(
    file: FileRow,
    track: { id: string; storageKey: string; sourcePath: string | null },
    speech: Uint8Array,
    settings: SubtitleSyncSettings,
  ): Promise<{ applied: boolean; alignment: Alignment } | null> {
    // Re-read the sidecar when there is one, so a re-sync starts from the
    // original timings instead of compounding an earlier correction.
    let source: string;
    try {
      source = track.sourcePath
        ? await readFile(join(dirname(join(file.rootPath, file.relativePath)), track.sourcePath), 'utf8')
        : (await store.read(track.storageKey)).toString('utf8');
    } catch { return null; }

    const cues = parseSubtitles(source);
    if (cues.length === 0) return null;
    const alignment = findAlignment(cues, speech, {
      maxOffsetMs: settings.maxOffsetSeconds * 1000,
      correctFramerate: settings.correctFramerate,
    });

    const applied = alignment.confidence >= settings.minConfidence
      && (Math.abs(alignment.offsetMs) > 0 || alignment.scale !== 1 || Boolean(track.sourcePath));
    if (applied) await store.write(track.storageKey, serializeVtt(applyAlignment(cues, alignment)));
    await database.update(mediaSubtitles).set({
      syncOffsetMs: applied ? Math.round(alignment.offsetMs) : null,
      syncScale: applied ? alignment.scale : null,
      syncConfidence: alignment.confidence,
      syncedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(mediaSubtitles.id, track.id));
    return { applied, alignment };
  }

  /** Import and align every subtitle of one file. */
  async function syncFile(file: FileRow, settings: SubtitleSyncSettings, signal: AbortSignal, force = false) {
    const imported = await importSidecars(file);
    const tracks = await database.select({
      id: mediaSubtitles.id, storageKey: mediaSubtitles.storageKey, sourcePath: mediaSubtitles.sourcePath,
      source: mediaSubtitles.source, syncedAt: mediaSubtitles.syncedAt,
    }).from(mediaSubtitles).where(eq(mediaSubtitles.mediaFileId, file.id));

    const pending = tracks.filter((track) => (force || !track.syncedAt)
      && (settings.includeEmbedded || track.source !== 'embedded'));
    if (pending.length === 0) return { imported, adjusted: 0, checked: 0 };

    if (signal.aborted) throw signal.reason ?? new Error('Subtitle sync cancelled');
    const pcm = await decoder.decode(join(file.rootPath, file.relativePath), settings.analyzeMinutes * 60, signal);
    const speech = speechMask(pcm, PCM_SAMPLE_RATE);
    if (speech.length === 0) return { imported, adjusted: 0, checked: 0 };

    let adjusted = 0;
    for (const track of pending) {
      const result = await syncTrack(file, track, speech, settings);
      if (result?.applied && (Math.abs(result.alignment.offsetMs) >= 100 || result.alignment.scale !== 1)) adjusted++;
    }
    return { imported, adjusted, checked: pending.length };
  }

  async function sweep(settings: SubtitleSyncSettings, signal: AbortSignal, force: boolean) {
    const files = await filesWithLibrary();
    let imported = 0; let adjusted = 0; let checked = 0; let failed = 0;
    for (const file of files) {
      if (signal.aborted) throw signal.reason ?? new Error('Subtitle sync cancelled');
      try {
        const result = await syncFile(file, settings, signal, force);
        imported += result.imported; adjusted += result.adjusted; checked += result.checked;
      } catch (cause) {
        if (signal.aborted) throw cause;
        failed++;
      }
    }
    return { summary: `Imported ${imported} sidecars, checked ${checked} tracks, re-timed ${adjusted}${failed ? `, ${failed} failed` : ''}` };
  }

  return {
    id: 'subtitle-sync',
    metadata: {
      name: 'Subtitle Sync',
      description: 'Imports sidecar subtitle files and re-times them against the audio, fixing offsets and PAL/NTSC drift.',
      version: '1.0.0',
    },
    settingsSchema: subtitleSyncSettingsSchema,
    fields: [
      { kind: 'number', key: 'maxOffsetSeconds', label: 'Largest correction (s)', description: 'A subtitle needing more than this is left alone.', min: 5, max: 600, group: 'Matching' },
      { kind: 'number', key: 'analyzeMinutes', label: 'Minutes of audio analyzed', description: 'Longer is steadier on films with sparse dialogue.', min: 2, max: 60, group: 'Matching' },
      { kind: 'number', key: 'minConfidence', label: 'Minimum confidence', description: 'How well cues must match speech before the fix is applied (0.3–0.99).', min: 0.3, max: 0.99, step: 0.05, group: 'Matching' },
      { kind: 'boolean', key: 'correctFramerate', label: 'Correct PAL/NTSC drift', description: 'Also try the framerate stretches, not just a constant shift.', group: 'Matching' },
      { kind: 'boolean', key: 'includeEmbedded', label: 'Also check embedded tracks', description: 'Tracks extracted from the file are usually already in sync.', group: 'Scope' },
    ],
    actions: [{
      id: 're-sync-all',
      label: 'Re-time everything',
      description: 'Measure every subtitle again from its original timings.',
      confirm: 'Re-time every stored subtitle? This re-reads each sidecar and re-analyzes its audio.',
      run: ({ settings, signal }) => sweep(settings, signal, true),
    }],
    // A newly ingested file gets its sidecars imported and timed straight away.
    events: {
      'media.file.ingested': async ({ payload, settings, signal }) => {
        const [file] = await filesWithLibrary(payload.mediaFileId);
        if (file) await syncFile(file, settings, signal);
      },
    },
    run: ({ settings, signal }) => sweep(settings, signal, false),
  };
}
