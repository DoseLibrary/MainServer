import { describe, expect, it, vi } from 'vitest';
import { PlexHistorySource } from './plex.ts';
import { TraktHistorySource } from './trakt.ts';
import { TautulliHistorySource } from './tautulli.ts';
import { HistorySourceError } from './types.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('PlexHistorySource', () => {
  const sections = { MediaContainer: { Directory: [
    { key: '1', type: 'movie', title: 'Movies' },
    { key: '2', type: 'show', title: 'Shows' },
    { key: '3', type: 'artist', title: 'Music' },
  ] } };

  it('reads movie and episode watch state with provider ids', async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith('/library/sections')) return json(sections);
      if (url.includes('/sections/1/')) return json({ MediaContainer: { Metadata: [
        { type: 'movie', title: 'One', year: 2020, viewCount: 1, viewOffset: 0, lastViewedAt: 1700000000, Guid: [{ id: 'tmdb://100' }, { id: 'imdb://tt1' }] },
        { type: 'movie', title: 'Partly', year: 2021, viewCount: 0, viewOffset: 90_000, Guid: [{ id: 'tmdb://101' }] },
        { type: 'movie', title: 'Untouched', year: 2019, viewCount: 0, viewOffset: 0, Guid: [{ id: 'tmdb://102' }] },
      ] } });
      return json({ MediaContainer: { Metadata: [
        { type: 'episode', title: 'Pilot', viewCount: 2, viewOffset: 0, Guid: [{ id: 'tmdb://900' }] },
      ] } });
    });
    const source = new PlexHistorySource(fetcher as never);

    const { entries, errors } = await source.read({ baseUrl: 'http://plex.local:32400/', token: 'secret' });
    expect(errors).toEqual([]);
    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({ match: { tmdbId: '100', imdbId: 'tt1', title: 'One', year: 2020, kind: 'movie' }, watched: true, positionSeconds: 0 });
    expect(entries[0]?.lastWatchedAt).toBe(new Date(1_700_000_000_000).toISOString());
    // Untouched titles never become entries; a partial watch becomes a resume point.
    expect(entries[1]).toMatchObject({ match: { tmdbId: '101' }, watched: false, positionSeconds: 90 });
    expect(entries[2]).toMatchObject({ match: { tmdbId: '900', kind: 'episode' }, watched: true });
    // Show sections are read at episode level.
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('/sections/2/all?type=4'), expect.anything());
    expect(fetcher).not.toHaveBeenCalledWith(expect.stringContaining('/sections/3/'), expect.anything());
  });

  it('reports an unreadable section without losing the rest', async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith('/library/sections')) return json(sections);
      if (url.includes('/sections/1/')) return json({ MediaContainer: { Metadata: [{ type: 'movie', title: 'One', viewCount: 1, Guid: [{ id: 'tmdb://100' }] }] } });
      return json({ error: 'boom' }, 500);
    });
    const { entries, errors } = await new PlexHistorySource(fetcher as never).read({ baseUrl: 'http://plex.local:32400', token: 'secret' });
    expect(entries).toHaveLength(1);
    expect(errors[0]).toContain('Shows');
  });

  it('raises a clear error on a bad token or unreachable server', async () => {
    const unauthorized = vi.fn(async () => json({ error: 'nope' }, 401));
    await expect(new PlexHistorySource(unauthorized as never).read({ baseUrl: 'http://plex.local:32400', token: 'bad' }))
      .rejects.toMatchObject({ name: 'HistorySourceError', status: 401 });

    const offline = vi.fn(async () => { throw new Error('ECONNREFUSED'); });
    await expect(new PlexHistorySource(offline as never).read({ baseUrl: 'http://plex.local:32400', token: 'x' }))
      .rejects.toBeInstanceOf(HistorySourceError);
  });
});

describe('TraktHistorySource', () => {
  it('maps watched movies, shows, and resume points by provider id', async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith('/sync/watched/movies')) return json([{ last_watched_at: '2024-02-01T00:00:00.000Z', movie: { title: 'One', year: 2020, ids: { tmdb: 100, imdb: 'tt1' } } }]);
      if (url.endsWith('/sync/watched/shows')) return json([{ last_watched_at: '2024-03-01T00:00:00.000Z', show: { title: 'Show', year: 2018, ids: { tmdb: 500 } } }]);
      return json([{ progress: 50, paused_at: '2024-04-01T00:00:00.000Z', movie: { title: 'Half', year: 2022, runtime: 120, ids: { tmdb: 200 } } }]);
    });
    const { entries, errors } = await new TraktHistorySource(fetcher as never).read({ clientId: 'client', accessToken: 'token' });

    expect(errors).toEqual([]);
    expect(entries[0]).toMatchObject({ match: { tmdbId: '100', imdbId: 'tt1', kind: 'movie' }, watched: true, lastWatchedAt: '2024-02-01T00:00:00.000Z' });
    expect(entries[1]).toMatchObject({ match: { tmdbId: '500', kind: 'series' }, watched: true });
    // 50% of a 120-minute runtime is one hour in.
    expect(entries[2]).toMatchObject({ match: { tmdbId: '200' }, watched: false, positionSeconds: 3600 });
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('/sync/watched/movies'), expect.objectContaining({ headers: expect.objectContaining({ 'trakt-api-key': 'client', Authorization: 'Bearer token' }) }));
  });

  it('keeps watched state when resume points cannot be read', async () => {
    const fetcher = vi.fn(async (url: string) => url.endsWith('/sync/playback') ? json({ error: 'boom' }, 500)
      : url.endsWith('/sync/watched/movies') ? json([{ movie: { title: 'One', ids: { tmdb: 100 } } }]) : json([]));
    const { entries, errors } = await new TraktHistorySource(fetcher as never).read({ clientId: 'c', accessToken: 't' });
    expect(entries).toHaveLength(1);
    expect(errors[0]).toContain('Resume points');
  });

  it('surfaces a rejected token', async () => {
    const fetcher = vi.fn(async () => json({ error: 'unauthorized' }, 403));
    await expect(new TraktHistorySource(fetcher as never).read({ clientId: 'c', accessToken: 'bad' }))
      .rejects.toMatchObject({ status: 401 });
  });
});

describe('TautulliHistorySource', () => {
  it('pages history, resolves ids once per rating key, and honours the user filter', async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes('cmd=get_metadata')) {
        const key = new URL(url).searchParams.get('rating_key');
        return json({ response: { result: 'success', data: { guids: [`tmdb://${key}`, 'imdb://tt7'] } } });
      }
      return json({ response: { result: 'success', data: { data: [
        { media_type: 'movie', title: 'One', year: 2020, rating_key: '100', watched_status: 1, view_offset: 0, stopped: 1700000000 },
        { media_type: 'episode', title: 'Pilot', rating_key: '900', watched_status: '0', view_offset: 120, stopped: 1700000100 },
        { media_type: 'movie', title: 'One', year: 2020, rating_key: '100', watched_status: 1, view_offset: 0, stopped: 1700000200 },
        { media_type: 'track', title: 'Song', rating_key: '5' },
      ] } } });
    });
    const { entries, errors } = await new TautulliHistorySource(fetcher as never).read({ baseUrl: 'http://tautulli.local:8181', apiKey: 'key', userId: '42' });

    expect(errors).toEqual([]);
    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({ match: { tmdbId: '100', imdbId: 'tt7', title: 'One', kind: 'movie' }, watched: true });
    expect(entries[1]).toMatchObject({ match: { tmdbId: '900', kind: 'episode' }, watched: false, positionSeconds: 120 });
    // Two history rows for one rating key cost a single metadata call.
    const metadataCalls = fetcher.mock.calls.filter(([url]) => String(url).includes('cmd=get_metadata'));
    expect(metadataCalls).toHaveLength(2);
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('user_id=42'), expect.anything());
  });

  it('fails clearly when Tautulli rejects the API key', async () => {
    const fetcher = vi.fn(async () => json({ response: { result: 'error', message: 'Invalid apikey' } }));
    await expect(new TautulliHistorySource(fetcher as never).read({ baseUrl: 'http://tautulli.local:8181', apiKey: 'bad' }))
      .rejects.toMatchObject({ name: 'HistorySourceError', status: 400 });
  });
});
