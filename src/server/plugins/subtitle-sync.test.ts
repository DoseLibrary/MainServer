import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from '../db/client.ts';
import { SubtitleStore } from '../subtitles.ts';
import { PCM_SAMPLE_RATE, type AudioDecoder } from '../audio-pcm.ts';
import { parseSubtitles } from '../subtitle-sync.ts';
import { PluginEventBus } from './events.ts';
import { createSubtitleSyncPlugin, describeSidecar } from './subtitle-sync.ts';

const LIB = '10000000-0000-4000-8000-000000000001';
const MOVIE = '20000000-0000-4000-8000-000000000001';
const FILE = '30000000-0000-4000-8000-000000000001';

const DIALOGUE: Array<[number, number]> = [
  [2, 5], [7, 9], [12, 16], [19, 21], [24, 28], [31, 33], [36, 40], [44, 47], [50, 54], [58, 61],
];

/** Speech where the dialogue is, a quiet floor everywhere else. */
function synthAudio(seconds: number): Int16Array {
  const pcm = new Int16Array(Math.floor(seconds * PCM_SAMPLE_RATE));
  let state = 4242;
  const random = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 0xffffffff; };
  for (const [from, to] of DIALOGUE) {
    for (let i = Math.floor(from * PCM_SAMPLE_RATE); i < Math.min(pcm.length, Math.floor(to * PCM_SAMPLE_RATE)); i++) {
      pcm[i] = Math.round((random() * 2 - 1) * 12000);
    }
  }
  for (let i = 0; i < pcm.length; i++) pcm[i] += Math.round((random() * 2 - 1) * 60);
  return pcm;
}

function srt(offsetSeconds: number): string {
  const stamp = (seconds: number) => {
    const ms = Math.max(0, Math.round(seconds * 1000));
    const h = String(Math.floor(ms / 3_600_000)).padStart(2, '0');
    const m = String(Math.floor((ms % 3_600_000) / 60_000)).padStart(2, '0');
    const s = String(Math.floor((ms % 60_000) / 1000)).padStart(2, '0');
    return `${h}:${m}:${s},${String(ms % 1000).padStart(3, '0')}`;
  };
  return DIALOGUE.map(([from, to], index) =>
    `${index + 1}\n${stamp(from + offsetSeconds)} --> ${stamp(to + offsetSeconds)}\nLine ${index + 1}`).join('\n\n');
}

describe('naming sidecars', () => {
  it('matches by stem and reads language and forced from the tags', () => {
    expect(describeSidecar('/media/Arrival (2016).mkv', 'Arrival (2016).en.srt')).toMatchObject({ language: 'en', forced: false, label: 'EN' });
    expect(describeSidecar('/media/Arrival (2016).mkv', 'Arrival (2016).sv.forced.srt')).toMatchObject({ language: 'sv', forced: true, label: 'SV · Forced' });
    expect(describeSidecar('/media/Arrival (2016).mkv', 'Arrival (2016).srt')).toMatchObject({ forced: false, label: 'External' });
  });

  it('ignores files belonging to another title or format', () => {
    expect(describeSidecar('/media/Arrival (2016).mkv', 'Dune (2021).en.srt')).toBeNull();
    expect(describeSidecar('/media/Arrival (2016).mkv', 'Arrival (2016).en.ass')).toBeNull();
  });
});

describe('subtitle-sync plugin', () => {
  let client: PGlite;
  let database: Database;
  let mediaDir: string;
  let storeDir: string;
  let store: SubtitleStore;
  let decoder: AudioDecoder;

  beforeEach(async () => {
    client = new PGlite('memory://');
    database = drizzle(client) as unknown as Database;
    await migrate(database as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') });
    mediaDir = await mkdtemp(join(tmpdir(), 'dose-subs-'));
    storeDir = await mkdtemp(join(tmpdir(), 'dose-store-'));
    store = new SubtitleStore(storeDir);
    decoder = { decode: vi.fn(async () => synthAudio(65)) };

    await client.query(`insert into libraries (id, name, kind, root_path) values ($1, 'Movies', 'movies', $2)`, [LIB, mediaDir]);
    await client.query(`insert into media_items (id, library_id, kind, natural_key, title, sort_title) values ($1, $2, 'movie', 'movie:one', 'Arrival', 'arrival')`, [MOVIE, LIB]);
    await client.query(`insert into media_files (id, media_item_id, library_id, relative_path, size_bytes, modified_at) values ($1, $2, $3, 'Arrival.mkv', 1, now())`, [FILE, MOVIE, LIB]);
  });

  afterEach(async () => {
    await client.close();
    await rm(mediaDir, { recursive: true, force: true });
    await rm(storeDir, { recursive: true, force: true });
  });

  const settings = () => ({ maxOffsetSeconds: 60, analyzeMinutes: 5, minConfidence: 0.6, correctFramerate: true, includeEmbedded: false });
  const idle = new AbortController().signal;
  const storedCues = async () => {
    const [row] = (await client.query<{ storage_key: string }>(`select storage_key from media_subtitles`)).rows;
    return parseSubtitles(await readFile(join(storeDir, row.storage_key), 'utf8'));
  };

  it('imports a sidecar and re-times it against the audio', async () => {
    // The download runs 6 seconds late against this release.
    await writeFile(join(mediaDir, 'Arrival.en.srt'), srt(6), 'utf8');
    const plugin = createSubtitleSyncPlugin(database, store, decoder);

    const result = await plugin.run!({ settings: settings(), signal: idle });
    expect(result?.summary).toContain('Imported 1 sidecars');
    expect(result?.summary).toContain('re-timed 1');

    const [row] = (await client.query<{ language: string; label: string; source: string; sync_offset_ms: number; sync_confidence: number }>(
      `select language, label, source, sync_offset_ms, sync_confidence from media_subtitles`)).rows;
    expect(row).toMatchObject({ language: 'en', label: 'EN', source: 'external' });
    expect(row.sync_offset_ms).toBeGreaterThan(-6500);
    expect(row.sync_offset_ms).toBeLessThan(-5500);
    expect(Number(row.sync_confidence)).toBeGreaterThan(0.8);

    // The stored WebVTT now lines up with where people actually speak.
    const cues = await storedCues();
    expect(Math.abs(cues[0].startMs - 2000)).toBeLessThan(400);
    expect(cues).toHaveLength(DIALOGUE.length);
  });

  it('leaves an already-synced subtitle where it is', async () => {
    await writeFile(join(mediaDir, 'Arrival.en.srt'), srt(0), 'utf8');
    await createSubtitleSyncPlugin(database, store, decoder).run!({ settings: settings(), signal: idle });

    const [row] = (await client.query<{ sync_offset_ms: number }>(`select sync_offset_ms from media_subtitles`)).rows;
    expect(Math.abs(row.sync_offset_ms)).toBeLessThanOrEqual(40);
    expect(Math.abs((await storedCues())[0].startMs - 2000)).toBeLessThan(200);
  });

  it('refuses to move a subtitle it cannot match', async () => {
    // Timings unrelated to the audio: dense chatter through the whole file.
    const noise = Array.from({ length: 40 }, (_, index) =>
      `${index + 1}\n00:00:${String(index).padStart(2, '0')},000 --> 00:00:${String(index).padStart(2, '0')},500\nx`).join('\n\n');
    await writeFile(join(mediaDir, 'Arrival.en.srt'), noise, 'utf8');

    const result = await createSubtitleSyncPlugin(database, store, decoder).run!({ settings: { ...settings(), minConfidence: 0.9 }, signal: idle });
    expect(result?.summary).toContain('re-timed 0');
    const [row] = (await client.query<{ sync_offset_ms: number | null; sync_confidence: number }>(`select sync_offset_ms, sync_confidence from media_subtitles`)).rows;
    expect(row.sync_offset_ms).toBeNull();
    expect(Number(row.sync_confidence)).toBeLessThan(0.9);
  });

  it('does not re-analyze a track it has already timed', async () => {
    await writeFile(join(mediaDir, 'Arrival.en.srt'), srt(6), 'utf8');
    const plugin = createSubtitleSyncPlugin(database, store, decoder);
    await plugin.run!({ settings: settings(), signal: idle });
    const decodes = (decoder.decode as ReturnType<typeof vi.fn>).mock.calls.length;

    const second = await plugin.run!({ settings: settings(), signal: idle });
    expect(second?.summary).toContain('checked 0 tracks');
    expect((decoder.decode as ReturnType<typeof vi.fn>).mock.calls.length).toBe(decodes);
  });

  it('re-times from the original file when asked again, instead of compounding', async () => {
    await writeFile(join(mediaDir, 'Arrival.en.srt'), srt(6), 'utf8');
    const plugin = createSubtitleSyncPlugin(database, store, decoder);
    await plugin.run!({ settings: settings(), signal: idle });

    await plugin.actions![0].run({ settings: settings(), signal: idle });

    const cues = await storedCues();
    expect(Math.abs(cues[0].startMs - 2000)).toBeLessThan(400);
  });

  it('skips embedded tracks unless asked to include them', async () => {
    await store.write(`${FILE}.2.vtt`, 'WEBVTT\n\n00:00:08.000 --> 00:00:11.000\nLine 1\n');
    await client.query(
      `insert into media_subtitles (media_file_id, stream_index, language, label, storage_key, source) values ($1, 2, 'eng', 'English', $2, 'embedded')`,
      [FILE, `${FILE}.2.vtt`]);
    const plugin = createSubtitleSyncPlugin(database, store, decoder);

    expect((await plugin.run!({ settings: settings(), signal: idle }))?.summary).toContain('checked 0 tracks');
    expect((decoder.decode as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);

    expect((await plugin.run!({ settings: { ...settings(), includeEmbedded: true }, signal: idle }))?.summary).toContain('checked 1 tracks');
  });

  it('times a sidecar as soon as its file is ingested', async () => {
    await writeFile(join(mediaDir, 'Arrival.sv.forced.srt'), srt(6), 'utf8');
    const bus = new PluginEventBus({ log: { error: vi.fn(), warn: vi.fn() } });
    const plugin = createSubtitleSyncPlugin(database, store, decoder);
    bus.subscribe('subtitle-sync', 'media.file.ingested', (event, payload) =>
      plugin.events!['media.file.ingested']!({ event, payload, settings: settings(), signal: idle }));

    bus.emit('media.file.ingested', { libraryId: LIB, mediaItemId: MOVIE, mediaFileId: FILE, relativePath: 'Arrival.mkv', created: true });
    await bus.drain();

    const [row] = (await client.query<{ forced: boolean; language: string; sync_offset_ms: number }>(
      `select forced, language, sync_offset_ms from media_subtitles`)).rows;
    expect(row).toMatchObject({ forced: true, language: 'sv' });
    expect(row.sync_offset_ms).toBeLessThan(-5000);
  });
});
