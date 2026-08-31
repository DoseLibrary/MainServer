import { z } from 'zod';
import type { WatchDataMatch, WatchDataProgressEntry } from '../watch-data-service.ts';
import { integer, readJson, record, records, text, type Fetcher, type HistorySource, type HistorySourceResult } from './types.ts';

export const traktConfig = z.object({
  clientId: z.string().trim().min(1).max(200),
  accessToken: z.string().trim().min(1).max(500),
  apiBaseUrl: z.string().trim().url().max(500).optional(),
});
export type TraktConfig = z.infer<typeof traktConfig>;

const DEFAULT_BASE = 'https://api.trakt.tv';

/**
 * Reads a Trakt account's watched state and resume points. Trakt returns provider
 * ids inline, so every entry matches by id and the title fallback is never needed.
 * The access token is used for this call only and never stored.
 */
export class TraktHistorySource implements HistorySource<TraktConfig> {
  readonly id = 'trakt';

  constructor(private readonly fetcher: Fetcher = fetch, private readonly timeoutMs = 15_000) {}

  async read(config: TraktConfig): Promise<HistorySourceResult> {
    const base = (config.apiBaseUrl ?? DEFAULT_BASE).replace(/\/+$/, '');
    const entries: WatchDataProgressEntry[] = [];
    const errors: string[] = [];

    const movies = records(await this.get(base, '/sync/watched/movies', config));
    for (const row of movies) {
      const match = toMatch(record(row.movie), 'movie');
      if (!match) continue;
      entries.push({ match, positionSeconds: 0, watched: true, lastWatchedAt: text(row.last_watched_at, 40) });
    }

    // Shows are recorded series-level: episode ids only arrive with a per-show call,
    // which would be one request per show. Episode resume still comes from /sync/playback.
    const shows = records(await this.get(base, '/sync/watched/shows', config));
    for (const row of shows) {
      const match = toMatch(record(row.show), 'series');
      if (!match) continue;
      entries.push({ match, positionSeconds: 0, watched: true, lastWatchedAt: text(row.last_watched_at, 40) });
    }

    try {
      for (const row of records(await this.get(base, '/sync/playback', config))) {
        const progress = typeof row.progress === 'number' ? row.progress : Number(row.progress);
        const episode = record(row.episode);
        const source = episode ?? record(row.movie) ?? record(row.show);
        const match = toMatch(source, episode ? 'episode' : row.movie ? 'movie' : 'series');
        if (!match || !Number.isFinite(progress)) continue;
        // Trakt reports a percentage, not seconds; runtime turns it into a position.
        const runtimeMinutes = integer(record(row.movie)?.runtime ?? record(row.show)?.runtime) ?? 0;
        const positionSeconds = runtimeMinutes > 0 ? Math.round((progress / 100) * runtimeMinutes * 60) : 0;
        entries.push({ match, positionSeconds, watched: false, lastWatchedAt: text(row.paused_at, 40) });
      }
    } catch (error) {
      errors.push(error instanceof Error ? `Resume points: ${error.message}` : 'Resume points could not be read');
    }

    return { entries, errors };
  }

  private get(base: string, path: string, config: TraktConfig) {
    return readJson(this.fetcher, `${base}${path}`, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'trakt-api-version': '2',
        'trakt-api-key': config.clientId,
        Authorization: `Bearer ${config.accessToken}`,
      },
    }, this.timeoutMs, 'Trakt');
  }
}

function toMatch(source: Record<string, unknown> | undefined, kind: WatchDataMatch['kind']): WatchDataMatch | null {
  if (!source) return null;
  const title = text(source.title);
  if (!title) return null;
  const ids = record(source.ids) ?? {};
  return {
    tmdbId: text(ids.tmdb, 32),
    imdbId: text(ids.imdb, 32),
    title,
    year: integer(source.year),
    kind,
  };
}
