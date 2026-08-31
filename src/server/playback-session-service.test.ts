import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from './db/client.ts';
import { PlaybackSessionService, UnknownSessionError } from './playback-session-service.ts';

const LIB = '10000000-0000-4000-8000-000000000001';
const MOVIE = '20000000-0000-4000-8000-000000000001';
const EPISODE = '20000000-0000-4000-8000-000000000002';
const OWNER = '70000000-0000-4000-8000-000000000001';
const GUEST = '70000000-0000-4000-8000-000000000002';

describe('PlaybackSessionService', () => {
  let client: PGlite;
  let database: Database;
  let sessions: PlaybackSessionService;

  beforeEach(async () => {
    client = new PGlite('memory://');
    database = drizzle(client) as unknown as Database;
    await migrate(database as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') });
    sessions = new PlaybackSessionService(database);
    await client.query(`insert into libraries (id, name, kind, root_path) values ($1, 'Movies', 'movies', '/media')`, [LIB]);
    await client.query(`insert into users (id, username, password_hash, role) values ($1, 'owner', 'x', 'admin'), ($2, 'guest', 'x', 'member')`, [OWNER, GUEST]);
    await client.query(`insert into media_items (id, library_id, kind, natural_key, title, sort_title) values ($1, $2, 'movie', 'movie:one', 'Arrival', 'arrival')`, [MOVIE, LIB]);
    await client.query(`insert into media_items (id, library_id, kind, natural_key, title, sort_title, season_number, episode_number) values ($1, $2, 'episode', 'series:x:s01e02', 'The Target', 'target', 1, 2)`, [EPISODE, LIB]);
  });

  afterEach(async () => { await client.close(); });

  it('lists what is playing with viewer, device, and progress', async () => {
    const { id } = await sessions.start({ userId: OWNER, mediaItemId: MOVIE, deviceName: 'Chrome on TV', playMethod: 'transcode', durationSeconds: 7500 });
    await sessions.heartbeat(id, OWNER, { positionSeconds: 1200 });

    const active = await sessions.listActive();
    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({
      username: 'owner', deviceName: 'Chrome on TV', playMethod: 'transcode',
      positionSeconds: 1200, durationSeconds: 7500, paused: false,
      item: { id: MOVIE, title: 'Arrival', kind: 'movie' },
    });
  });

  it('reports episode numbering so an admin can tell which one is playing', async () => {
    await sessions.start({ userId: GUEST, mediaItemId: EPISODE });
    expect((await sessions.listActive())[0].item).toMatchObject({ title: 'The Target', seasonNumber: 1, episodeNumber: 2 });
  });

  it('records a pause without ending the session', async () => {
    const { id } = await sessions.start({ userId: OWNER, mediaItemId: MOVIE });
    await sessions.heartbeat(id, OWNER, { paused: true, positionSeconds: 30 });

    expect((await sessions.listActive())[0]).toMatchObject({ paused: true, positionSeconds: 30 });
  });

  it('refuses reports from anyone but the session owner', async () => {
    const { id } = await sessions.start({ userId: OWNER, mediaItemId: MOVIE });
    await expect(sessions.heartbeat(id, GUEST, { positionSeconds: 60 })).rejects.toBeInstanceOf(UnknownSessionError);
    expect(await sessions.stop(id, GUEST)).toBeNull();
    expect(await sessions.listActive()).toHaveLength(1);
  });

  it('drops the session when playback ends, and tolerates a second stop', async () => {
    const { id } = await sessions.start({ userId: OWNER, mediaItemId: MOVIE });
    expect(await sessions.stop(id, OWNER)).toMatchObject({ id });
    expect(await sessions.stop(id, OWNER)).toBeNull();
    expect(await sessions.listActive()).toHaveLength(0);
  });

  it('replaces a stale row when the same viewer restarts the same title', async () => {
    const first = await sessions.start({ userId: OWNER, mediaItemId: MOVIE });
    const second = await sessions.start({ userId: OWNER, mediaItemId: MOVIE });

    const active = await sessions.listActive();
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(second.id);
    expect(active[0].id).not.toBe(first.id);
  });

  it('closes sessions whose client stopped reporting', async () => {
    await sessions.start({ userId: OWNER, mediaItemId: MOVIE });
    await client.query(`update playback_sessions set last_reported_at = now() - interval '5 minutes'`);

    // Already invisible to the listing, and closed for good by the sweep.
    expect(await sessions.listActive()).toHaveLength(0);
    await sessions.closeStale();
    const [row] = (await client.query<{ ended_at: string | null }>(`select ended_at from playback_sessions`)).rows;
    expect(row.ended_at).not.toBeNull();
  });
});
