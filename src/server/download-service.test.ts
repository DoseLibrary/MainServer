import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { execFile } from 'node:child_process';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from './db/client.ts';
import { DownloadService, GrantNotReadyError, UnknownGrantError, ffmpegDownloadEncoder, type DownloadEncoder } from './download-service.ts';

const execFileAsync = promisify(execFile);

const LIB = '10000000-0000-4000-8000-000000000001';
const MOVIE = '20000000-0000-4000-8000-000000000001';
const OWNER = '70000000-0000-4000-8000-000000000001';
const GUEST = '70000000-0000-4000-8000-000000000002';

describe('DownloadService', () => {
  let client: PGlite;
  let database: Database;
  let storage: string;
  let encoder: DownloadEncoder & { encode: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    client = new PGlite('memory://');
    database = drizzle(client) as unknown as Database;
    await migrate(database as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') });
    storage = await mkdtemp(join(tmpdir(), 'dose-dl-'));
    // Stands in for ffmpeg: writes a file where the real encoder would.
    encoder = { encode: vi.fn(async (args: string[]) => { await writeFile(args[args.length - 1], 'video-bytes'); }) };

    await client.query(`insert into libraries (id, name, kind, root_path) values ($1, 'Movies', 'movies', '/media')`, [LIB]);
    await client.query(`insert into users (id, username, password_hash, role) values ($1, 'owner', 'x', 'member'), ($2, 'guest', 'x', 'member')`, [OWNER, GUEST]);
    await client.query(`insert into media_items (id, library_id, kind, natural_key, title, sort_title) values ($1, $2, 'movie', 'movie:one', 'Arrival', 'arrival')`, [MOVIE, LIB]);
  });

  afterEach(async () => {
    await client.close();
    await rm(storage, { recursive: true, force: true });
  });

  const service = (ttlMs?: number) => new DownloadService(database, storage, encoder, ttlMs);
  const requestOne = (owner = OWNER, downloads = service()) => downloads.request({
    userId: owner, mediaItemId: MOVIE, profile: 'sd',
    sourcePath: '/media/Arrival.mkv', durationSeconds: 7200, title: 'Arrival',
  });
  const settle = () => vi.waitFor(async () => expect((await client.query<{ status: string }>(`select status from download_grants`)).rows[0]?.status).not.toBe('preparing'));

  it('estimates the size up front and reports the file once encoded', async () => {
    const downloads = service();
    const grant = await requestOne(OWNER, downloads);

    // The estimate is available immediately, so a season total can be shown.
    expect(grant.status).toBe('preparing');
    expect(grant.estimatedBytes).toBeGreaterThan(800_000_000);
    expect(grant.expiresAt.getTime()).toBeGreaterThan(Date.now());

    await settle();
    const ready = await downloads.get(OWNER, grant.id);
    expect(ready).toMatchObject({ status: 'ready', title: 'Arrival', profile: 'sd' });
    expect(ready.sizeBytes).toBe('video-bytes'.length);
    await expect(downloads.fileFor(OWNER, grant.id)).resolves.toMatchObject({ size: 'video-bytes'.length });
  });

  it('refuses the file while it is still encoding', async () => {
    let release!: () => void;
    encoder.encode.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
    const downloads = service();
    const grant = await requestOne(OWNER, downloads);

    await expect(downloads.fileFor(OWNER, grant.id)).rejects.toBeInstanceOf(GrantNotReadyError);
    // The encode starts after a directory check, so wait for it before letting go.
    await vi.waitFor(() => expect(encoder.encode).toHaveBeenCalled());
    release();
  });

  it('records a failed encode with its reason and leaves nothing behind', async () => {
    encoder.encode.mockRejectedValueOnce(new Error('ffmpeg exited with code 1: no such stream'));
    const downloads = service();
    const grant = await requestOne(OWNER, downloads);

    await settle();
    const failed = await downloads.get(OWNER, grant.id);
    expect(failed.status).toBe('failed');
    expect(failed.error).toContain('no such stream');
    await expect(access(join(storage, `${grant.id}.mp4`))).rejects.toThrow();
  });

  it('drops the server copy once the device has the bytes', async () => {
    const downloads = service();
    const grant = await requestOne(OWNER, downloads);
    await settle();
    const path = (await downloads.fileFor(OWNER, grant.id)).path;

    await downloads.claim(OWNER, grant.id);

    await expect(access(path)).rejects.toThrow();
    // The row survives, so the device's expiry still has an owner.
    expect((await downloads.get(OWNER, grant.id)).status).toBe('claimed');
  });

  it('keeps one account downloads away from another', async () => {
    const downloads = service();
    const grant = await requestOne(OWNER, downloads);
    await settle();

    await expect(downloads.get(GUEST, grant.id)).rejects.toBeInstanceOf(UnknownGrantError);
    await expect(downloads.fileFor(GUEST, grant.id)).rejects.toBeInstanceOf(UnknownGrantError);
    await expect(downloads.claim(GUEST, grant.id)).rejects.toBeInstanceOf(UnknownGrantError);
    expect(await downloads.list(GUEST)).toHaveLength(0);
    expect(await downloads.list(OWNER)).toHaveLength(1);
  });

  it('refuses an expired download and sweeps it away', async () => {
    const downloads = service(-1_000); // already expired on creation
    const grant = await requestOne(OWNER, downloads);
    await settle();

    await expect(downloads.fileFor(OWNER, grant.id)).rejects.toThrow(/expired/);
    await downloads.sweep();

    await expect(access(join(storage, `${grant.id}.mp4`))).rejects.toThrow();
    expect(await downloads.list(OWNER)).toHaveLength(0);
  });

  it('cancelling removes the row and the file', async () => {
    const downloads = service();
    const grant = await requestOne(OWNER, downloads);
    await settle();

    await downloads.cancel(OWNER, grant.id);

    await expect(access(join(storage, `${grant.id}.mp4`))).rejects.toThrow();
    expect(await downloads.list(OWNER)).toHaveLength(0);
  });
});

describe('the real encoder', () => {
  let dir: string;

  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'dose-enc-')); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it('produces a faststart MP4 a phone can start before it finishes reading', async () => {
    const source = join(dir, 'source.mp4');
    const output = join(dir, 'out.mp4');
    await execFileAsync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=24:duration=4',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4', '-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac', '-shortest', '-y', source], { timeout: 60_000 });

    const { buildDownloadArgs, DOWNLOAD_PROFILES } = await import('./download-profiles.ts');
    await ffmpegDownloadEncoder().encode(buildDownloadArgs(source, output, DOWNLOAD_PROFILES.sd), new AbortController().signal);

    const { stdout } = await execFileAsync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,height:format=format_name', '-of', 'json', output], { timeout: 30_000 });
    const probe = JSON.parse(stdout) as { streams: Array<{ codec_name: string; height?: number }>; format: { format_name: string } };
    expect(probe.format.format_name).toContain('mp4');
    expect(probe.streams.map((stream) => stream.codec_name)).toEqual(expect.arrayContaining(['h264', 'aac']));
    expect(probe.streams.find((stream) => stream.height)?.height).toBe(480);
  }, 120_000);
});
