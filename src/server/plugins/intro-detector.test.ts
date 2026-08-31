import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from '../db/client.ts';
import { PluginEventBus } from './events.ts';
import { SAMPLE_RATE, createIntroDetectorPlugin, findSharedSegment, fingerprint, type IntroAudioTools } from './intro-detector.ts';

const LIB = '10000000-0000-4000-8000-000000000001';
const SERIES = '20000000-0000-4000-8000-000000000010';
const SEASON = '20000000-0000-4000-8000-000000000011';
const EP1 = '20000000-0000-4000-8000-000000000012';
const EP2 = '20000000-0000-4000-8000-000000000013';
const FILE1 = '30000000-0000-4000-8000-000000000012';
const FILE2 = '30000000-0000-4000-8000-000000000013';

/** Deterministic noise whose loudness envelope varies, so the energy-delta
 * fingerprint carries structure instead of a constant bit. */
function synthAudio(seconds: number, seed: number): Int16Array {
  const samples = new Int16Array(Math.floor(seconds * SAMPLE_RATE));
  let state = seed >>> 0;
  const random = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 0xffffffff; };
  let level = 0.5;
  for (let i = 0; i < samples.length; i++) {
    // Level drifts every ~46ms block; per-sample noise rides on top of it.
    if (i % 256 === 0) level = Math.min(1, Math.max(0.05, level + (random() - 0.5) * 0.4));
    samples[i] = Math.round((random() * 2 - 1) * level * 16000);
  }
  return samples;
}

function concat(...parts: Int16Array[]): Int16Array {
  const out = new Int16Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}

const INTRO = synthAudio(45, 7);
// Episode 1: 20s recap, then the intro, then the episode body.
const EPISODE1 = concat(synthAudio(20, 11), INTRO, synthAudio(120, 13));
// Episode 2: cold-opens straight into the intro at 5s.
const EPISODE2 = concat(synthAudio(5, 17), INTRO, synthAudio(120, 19));

describe('intro fingerprint correlation', () => {
  it('locates the shared segment at its true offset in both streams', () => {
    const match = findSharedSegment(fingerprint(EPISODE1), fingerprint(EPISODE2), { minSeconds: 20, maxSeconds: 150, threshold: 0.8 });
    expect(match).not.toBeNull();
    expect(match!.aStart).toBeGreaterThan(15); expect(match!.aStart).toBeLessThan(25);
    expect(match!.aEnd).toBeGreaterThan(58); expect(match!.aEnd).toBeLessThan(70);
    expect(match!.bStart).toBeGreaterThan(0); expect(match!.bStart).toBeLessThan(10);
    expect(match!.bEnd - match!.bStart).toBeCloseTo(match!.aEnd - match!.aStart, 1);
  });

  it('returns null when the streams share nothing', () => {
    const a = fingerprint(concat(synthAudio(60, 23)));
    const b = fingerprint(concat(synthAudio(60, 29)));
    expect(findSharedSegment(a, b, { minSeconds: 20, maxSeconds: 150, threshold: 0.8 })).toBeNull();
  });
});

describe('intro-detector plugin', () => {
  let client: PGlite;
  let database: Database;

  const audio: IntroAudioTools = {
    decode: vi.fn(async (path: string) => (path.includes('e01') ? EPISODE1 : EPISODE2)),
  };

  beforeEach(async () => {
    client = new PGlite('memory://');
    database = drizzle(client) as unknown as Database;
    await migrate(database as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') });
    await client.query(`insert into libraries (id, name, kind, root_path) values ($1, 'Shows', 'shows', '/media')`, [LIB]);
    await client.query(`insert into media_items (id, library_id, kind, natural_key, title, sort_title) values ($1, $2, 'series', 'series:demo', 'Demo', 'demo')`, [SERIES, LIB]);
    await client.query(`insert into media_items (id, library_id, parent_id, kind, natural_key, title, sort_title, season_number) values ($1, $2, $3, 'season', 'series:demo:season:1', 'Season 1', '001', 1)`, [SEASON, LIB, SERIES]);
    await client.query(`insert into media_items (id, library_id, parent_id, kind, natural_key, title, sort_title, season_number, episode_number) values ($1, $2, $3, 'episode', 'series:demo:s01e01', 'E1', 'e1', 1, 1)`, [EP1, LIB, SEASON]);
    await client.query(`insert into media_items (id, library_id, parent_id, kind, natural_key, title, sort_title, season_number, episode_number) values ($1, $2, $3, 'episode', 'series:demo:s01e02', 'E2', 'e2', 1, 2)`, [EP2, LIB, SEASON]);
    await client.query(`insert into media_files (id, media_item_id, library_id, relative_path, size_bytes, modified_at) values ($1, $2, $3, 'demo/s01e01.mkv', 1, now())`, [FILE1, EP1, LIB]);
    await client.query(`insert into media_files (id, media_item_id, library_id, relative_path, size_bytes, modified_at) values ($1, $2, $3, 'demo/s01e02.mkv', 1, now())`, [FILE2, EP2, LIB]);
  });

  afterEach(async () => { await client.close(); vi.clearAllMocks(); });

  const settings = () => ({ scanMinutes: 5, minIntroSeconds: 20, maxIntroSeconds: 150, matchThreshold: 0.8 });

  it('writes an intro marker for every episode of the season', async () => {
    const plugin = createIntroDetectorPlugin(database, audio);
    const result = await plugin.run!({ settings: settings(), signal: new AbortController().signal });

    expect(result?.summary).toContain('wrote 2 intro markers');
    const rows = (await client.query<{ media_file_id: string; start_seconds: number; end_seconds: number }>(`select media_file_id, start_seconds, end_seconds from media_intro_markers order by start_seconds desc`)).rows;
    expect(rows).toHaveLength(2);
    const [ep1, ep2] = rows;
    expect(ep1.media_file_id).toBe(FILE1);
    expect(ep1.start_seconds).toBeGreaterThan(15); expect(ep1.start_seconds).toBeLessThan(25);
    expect(ep2.media_file_id).toBe(FILE2);
    expect(ep2.start_seconds).toBeLessThan(10);
  });

  it('skips unchanged files on the next sweep', async () => {
    const plugin = createIntroDetectorPlugin(database, audio);
    await plugin.run!({ settings: settings(), signal: new AbortController().signal });
    const callsAfterFirst = (audio.decode as ReturnType<typeof vi.fn>).mock.calls.length;

    const second = await plugin.run!({ settings: settings(), signal: new AbortController().signal });
    expect(second?.summary).toContain('wrote 0 intro markers');
    expect((audio.decode as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterFirst);
  });

  it('analyzes a season when one of its episodes is ingested', async () => {
    const bus = new PluginEventBus({ log: { error: vi.fn(), warn: vi.fn() } });
    const plugin = createIntroDetectorPlugin(database, audio);
    bus.subscribe('intro-detector', 'media.file.ingested', (event, payload) =>
      plugin.events!['media.file.ingested']!({ event, payload, settings: settings(), signal: new AbortController().signal }));

    bus.emit('media.file.ingested', { libraryId: LIB, mediaItemId: EP2, mediaFileId: FILE2, relativePath: 'demo/s01e02.mkv', created: true });
    await bus.drain();

    const rows = (await client.query(`select media_file_id from media_intro_markers`)).rows;
    expect(rows).toHaveLength(2);
  });
});
