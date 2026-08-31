import { describe, expect, it, vi } from 'vitest';
import { TmdbClient } from './tmdb.ts';

const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });

describe('TmdbClient rich metadata', () => {
  it('searches lightweight movie and series candidates and skips the network for an empty query', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json({ results: [
      { id: 10, name: 'The Flash', first_air_date: '2014-10-07', overview: 'Fast.', poster_path: '/flash.jpg' },
      { id: 'bad', name: 'Ignored' },
    ] }));
    const client = new TmdbClient('token', 1, 1000, 1000, fetcher, async () => undefined);
    await expect(client.searchTitles('series', 'The Flash')).resolves.toEqual([{ id: 10, title: 'The Flash', year: 2014, overview: 'Fast.', posterPath: '/flash.jpg' }]);
    expect(fetcher.mock.calls[0]?.[0]).toContain('/search/tv?query=The+Flash');
    await expect(client.searchTitles('movie', '   ')).resolves.toEqual([]);
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('fetches videos directly by provider id without title search', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json({ results: [{ id: 'v1', key: 'abc', site: 'YouTube', name: 'Official Trailer', type: 'Trailer', official: true, iso_639_1: 'en', published_at: '2024-01-01T00:00:00Z' }] }));
    const client = new TmdbClient('token', 1, 1000, 1000, fetcher, async () => undefined);
    await expect(client.getVideos('movie', 42)).resolves.toMatchObject([{ id: 'v1', key: 'abc', official: true }]);
    expect(fetcher).toHaveBeenCalledOnce(); expect(fetcher.mock.calls[0]?.[0]).toContain('/movie/42/videos'); expect(fetcher.mock.calls[0]?.[0]).not.toContain('/search/');
  });
  it('maps bounded movie details, credits, genres, collection and recommendations', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json({ results: [{ id: 10, title: 'Dune', release_date: '2021-10-22' }] }))
      .mockResolvedValueOnce(json({
        id: 10, title: 'Dune', original_title: 'Dune', overview: 'Desert.', release_date: '2021-10-22', tagline: 'Beyond fear.', runtime: 155,
        vote_average: 8.1, poster_path: '/poster.jpg', backdrop_path: '/backdrop.jpg', genres: [{ id: 878, name: 'Science Fiction' }],
        belongs_to_collection: { id: 726871, name: 'Dune Collection', poster_path: '/collection.jpg' },
        credits: { cast: [{ id: 1, name: 'Actor', character: 'Hero', order: 0, profile_path: '/actor.jpg' }, { id: 'bad', name: 'Ignored' }] },
        recommendations: { results: [{ id: 20, title: 'Arrival', release_date: '2016-11-11', media_type: 'movie', poster_path: '/arrival.jpg' }] },
        release_dates: { results: [{ iso_3166_1: 'US', release_dates: [{ certification: 'PG-13' }] }] },
        external_ids: { imdb_id: 'tt1160419', invalid: null },
        images: { logos: [{ file_path: '/fr.png', iso_639_1: 'fr' }, { file_path: '/en.png', iso_639_1: 'en' }] },
      }));
    const client = new TmdbClient('token', 1, 1000, 1000, fetcher, async () => undefined);
    await expect(client.find('movie', 'Dune', 2021)).resolves.toMatchObject({
      id: 10, kind: 'movie', title: 'Dune', year: 2021, runtimeMinutes: 155, contentRating: 'PG-13', rating: 8.1,
      genres: [{ id: 878, name: 'Science Fiction' }], cast: [{ personId: 1, name: 'Actor', character: 'Hero', profilePath: '/actor.jpg' }],
      collection: { id: 726871, name: 'Dune Collection' }, recommendations: [{ id: 20, kind: 'movie', title: 'Arrival', year: 2016 }],
      externalIds: { imdb_id: 'tt1160419' }, logoPath: '/en.png',
    });
    expect(fetcher.mock.calls[1]?.[0]).toContain('append_to_response=credits,recommendations,release_dates,external_ids');
  });

  it('maps series ratings and runtime while dropping unsafe image paths', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json({ results: [{ id: 2, name: 'Show' }] })).mockResolvedValueOnce(json({
      id: 2, name: 'Show', first_air_date: '2020-01-02', episode_run_time: [47], poster_path: 'https://evil.test/x.jpg',
      content_ratings: { results: [{ iso_3166_1: 'US', rating: 'TV-MA' }] }, credits: { cast: [] }, recommendations: { results: [] },
    }));
    const client = new TmdbClient('token', 1, 1000, 1000, fetcher, async () => undefined);
    await expect(client.find('series', 'Show')).resolves.toMatchObject({ kind: 'series', year: 2020, runtimeMinutes: 47, contentRating: 'TV-MA', genres: [], cast: [], recommendations: [] });
    expect((await client.find('series', 'Show'))?.posterPath).toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('prefers English title-bearing artwork, then neutral artwork', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json({ id: 10, title: 'Film', poster_path: '/default.jpg', backdrop_path: '/default-bg.jpg', credits: { cast: [] }, recommendations: { results: [] }, images: {
      posters: [{ file_path: '/fr.jpg', iso_639_1: 'fr', vote_average: 9 }, { file_path: '/neutral.jpg', iso_639_1: null, vote_average: 8 }, { file_path: '/en.jpg', iso_639_1: 'en', vote_average: 3 }],
      backdrops: [{ file_path: '/neutral-bg.jpg', iso_639_1: null }, { file_path: '/de-bg.jpg', iso_639_1: 'de' }],
    } }));
    const client = new TmdbClient('token', 1, 1000, 1000, fetcher, async () => undefined);
    await expect(client.getById('movie', 10)).resolves.toMatchObject({ posterPath: '/en.jpg', backdropPath: '/neutral-bg.jpg' });
  });
  it('retains foreign-only artwork and logos as the final default fallback', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json({ id: 11, title: 'Film', credits: { cast: [] }, recommendations: { results: [] }, images: {
      posters: [{ file_path: '/ja.jpg', iso_639_1: 'ja' }], backdrops: [{ file_path: '/fr-bg.jpg', iso_639_1: 'fr' }], logos: [{ file_path: '/ko-logo.png', iso_639_1: 'ko' }],
    } }));
    const client = new TmdbClient('token', 1, 1000, 1000, fetcher, async () => undefined);
    await expect(client.getById('movie', 11)).resolves.toMatchObject({ posterPath: '/ja.jpg', backdropPath: '/fr-bg.jpg', logoPath: '/ko-logo.png' });
    expect(fetcher.mock.calls[0]?.[0]).not.toContain('include_image_language');
  });

  it('maps season, episode and collection detail endpoints and caches them', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json({ id: 100, season_number: 1, name: 'Season 1', air_date: '2022-01-01', poster_path: '/s.jpg', episodes: [{ id: 101, season_number: 1, episode_number: 1, name: 'Pilot', runtime: 50, still_path: '/e.jpg' }] }))
      .mockResolvedValueOnce(json({ id: 102, season_number: 1, episode_number: 2, name: 'Second', air_date: '2022-01-08' }))
      .mockResolvedValueOnce(json({ id: 7, name: 'Saga', overview: 'All films.', parts: [{ id: 8, title: 'First', release_date: '2000-01-01' }] }));
    const client = new TmdbClient('token', 1, 1000, 1000, fetcher, async () => undefined);
    expect(await client.getSeason(2, 1)).toMatchObject({ id: 100, seriesId: 2, seasonNumber: 1, year: 2022, episodes: [{ id: 101, episodeNumber: 1, runtimeMinutes: 50 }] });
    expect(await client.getEpisode(2, 1, 2)).toMatchObject({ id: 102, episodeNumber: 2, title: 'Second' });
    expect(await client.getCollection(7)).toMatchObject({ id: 7, name: 'Saga', parts: [{ id: 8, title: 'First', year: 2000 }] });
    await client.getCollection(7);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('degrades malformed responses to null or safe partial values', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json({ results: [{ id: 1, title: 'Fallback' }] })).mockResolvedValueOnce(json({ id: 1, title: 42, genres: 'bad', credits: null, recommendations: {} }));
    const client = new TmdbClient('token', 1, 1000, 1000, fetcher, async () => undefined);
    await expect(client.find('movie', 'Fallback')).resolves.toMatchObject({ title: 'Fallback', genres: [], cast: [], recommendations: [] });
    expect(await client.getEpisode(-1, 1, 1)).toBeNull();
  });
});
