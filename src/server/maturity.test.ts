import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CatalogService } from './catalog-service.ts';
import type { Database } from './db/client.ts';
import { maturityLabel, maturityLevel, UNRATED_LEVEL } from './maturity.ts';

const LIB = '10000000-0000-4000-8000-000000000001';
const KIDS = '20000000-0000-4000-8000-000000000001';
const TEEN = '20000000-0000-4000-8000-000000000002';
const ADULT = '20000000-0000-4000-8000-000000000003';
const UNRATED = '20000000-0000-4000-8000-000000000004';
const SHOW = '20000000-0000-4000-8000-000000000005';
const SEASON = '20000000-0000-4000-8000-000000000006';
const EPISODE = '20000000-0000-4000-8000-000000000007';
const USER = '70000000-0000-4000-8000-000000000001';
const FILE = '30000000-0000-4000-8000-000000000001';

describe('rating normalization', () => {
  it('orders ratings from several systems on one scale', () => {
    expect(maturityLevel('G')).toBeLessThan(maturityLevel('PG'));
    expect(maturityLevel('PG')).toBeLessThan(maturityLevel('PG-13'));
    expect(maturityLevel('PG-13')).toBeLessThan(maturityLevel('R'));
    expect(maturityLevel('TV-Y7')).toBeLessThan(maturityLevel('TV-14'));
    expect(maturityLevel('TV-14')).toBeLessThan(maturityLevel('TV-MA'));
    expect(maturityLevel('16')).toBe(16);
    expect(maturityLevel('US:TV-14')).toBe(14);
  });

  it('treats missing or unknown ratings as unrated, not as safe', () => {
    expect(maturityLevel(null)).toBe(UNRATED_LEVEL);
    expect(maturityLevel('')).toBe(UNRATED_LEVEL);
    expect(maturityLevel('WHO KNOWS')).toBe(UNRATED_LEVEL);
    expect(maturityLabel(null)).toBe('No limit');
    expect(maturityLabel(13)).toContain('Teens');
  });
});

describe('parental limits in the catalog', () => {
  let client: PGlite;
  let database: Database;
  let catalog: CatalogService;

  beforeEach(async () => {
    client = new PGlite('memory://');
    database = drizzle(client) as unknown as Database;
    await migrate(database as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') });
    catalog = new CatalogService(database);

    await client.query(`insert into libraries (id, name, kind, root_path) values ($1, 'Movies', 'movies', '/media')`, [LIB]);
    await client.query(`insert into users (id, username, password_hash, role) values ($1, 'kid', 'x', 'member')`, [USER]);
    const movie = (id: string, key: string, title: string, rating: string | null, level: number | null) =>
      client.query(
        `insert into media_items (id, library_id, kind, natural_key, title, sort_title, content_rating, maturity_level) values ($1, $2, 'movie', $3, $4, $5, $6, $7)`,
        [id, LIB, key, title, title.toLowerCase(), rating, level],
      );
    await movie(KIDS, 'movie:kids', 'Paddington', 'G', 0);
    await movie(TEEN, 'movie:teen', 'Dune', 'PG-13', 13);
    await movie(ADULT, 'movie:adult', 'Sicario', 'R', 17);
    await movie(UNRATED, 'movie:unrated', 'Home Video', null, null);
    await client.query(`insert into media_items (id, library_id, kind, natural_key, title, sort_title, content_rating, maturity_level) values ($1, $2, 'series', 'series:mature', 'The Wire', 'wire', 'TV-MA', 17)`, [SHOW, LIB]);
    await client.query(`insert into media_items (id, library_id, parent_id, kind, natural_key, title, sort_title, season_number, maturity_level) values ($1, $2, $3, 'season', 'series:mature:s1', 'Season 1', '001', 1, 17)`, [SEASON, LIB, SHOW]);
    await client.query(`insert into media_items (id, library_id, parent_id, kind, natural_key, title, sort_title, season_number, episode_number, maturity_level) values ($1, $2, $3, 'episode', 'series:mature:s01e01', 'The Target', 'target', 1, 1, 17)`, [EPISODE, LIB, SEASON]);
    await client.query(`insert into media_files (id, media_item_id, library_id, relative_path, size_bytes, modified_at) values ($1, $2, $3, 'Sicario.mkv', 1, now())`, [FILE, ADULT, LIB]);
  });

  afterEach(async () => { await client.close(); });

  it('hides titles above the limit from the home rows', async () => {
    const restricted = catalog.forViewer(13);
    const home = await restricted.home(undefined, USER);
    const titles = home.sections.flatMap((section) => section.items.map((item) => item.title));

    expect(titles).toContain('Paddington');
    expect(titles).toContain('Dune');
    expect(titles).not.toContain('Sicario');
    expect(titles).not.toContain('The Wire');
    // Unrated is withheld rather than assumed safe.
    expect(titles).not.toContain('Home Video');
  });

  it('hides them from search and from a direct item read', async () => {
    const restricted = catalog.forViewer(13);

    const allowed = (await restricted.search(undefined, 'dune')).groups.flatMap((group) => group.items.map((item) => item.title));
    expect(allowed).toContain('Dune');
    const blocked = (await restricted.search(undefined, 'sicario')).groups.flatMap((group) => group.items.map((item) => item.title));
    expect(blocked).toEqual([]);

    expect(await restricted.item(ADULT, USER)).toBeNull();
    expect(await restricted.item(TEEN, USER)).toMatchObject({ title: 'Dune' });
  });

  it('refuses to hand out a playback source above the limit', async () => {
    expect(await catalog.forViewer(13).playbackSource(ADULT)).toBeNull();
    // The same file is available to an unrestricted viewer.
    expect(await catalog.playbackSource(ADULT)).toMatchObject({ relativePath: 'Sicario.mkv' });
  });

  it('hides a restricted show children, so an episode cannot be reached through its season', async () => {
    const restricted = catalog.forViewer(13);
    expect(await restricted.item(SHOW, USER)).toBeNull();
    expect(await restricted.item(SEASON, USER)).toBeNull();
    expect(await restricted.item(EPISODE, USER)).toBeNull();
  });

  it('leaves an unrestricted viewer untouched', async () => {
    const home = await catalog.home(undefined, USER);
    const titles = home.sections.flatMap((section) => section.items.map((item) => item.title));
    expect(titles).toEqual(expect.arrayContaining(['Paddington', 'Dune', 'Sicario', 'Home Video']));
    expect(catalog.forViewer(null)).toBe(catalog);
  });
});
