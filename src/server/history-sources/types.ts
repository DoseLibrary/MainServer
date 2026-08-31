import type { WatchDataMatch, WatchDataProgressEntry } from '../watch-data-service.ts';

export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

/** Entries an external source yielded, plus non-fatal problems worth reporting. */
export interface HistorySourceResult {
  entries: WatchDataProgressEntry[];
  errors: string[];
}

/** A read-only history provider (Plex, Trakt, Tautulli). Never writes to the source. */
export interface HistorySource<Config> {
  readonly id: string;
  read(config: Config): Promise<HistorySourceResult>;
}

/** Connection/credential failure: the route answers 4xx and nothing is written. */
export class HistorySourceError extends Error {
  constructor(message: string, readonly status = 502) { super(message); this.name = 'HistorySourceError'; }
}

/** Provider ids as they appear in `tmdb://123` / `imdb://tt1` style guid strings. */
export function idsFromGuids(guids: readonly string[]): Pick<WatchDataMatch, 'tmdbId' | 'imdbId'> {
  const ids: Pick<WatchDataMatch, 'tmdbId' | 'imdbId'> = {};
  for (const guid of guids) {
    const tmdb = /^tmdb:\/\/(\d+)/.exec(guid);
    if (tmdb) { ids.tmdbId ??= tmdb[1]; continue; }
    const imdb = /^imdb:\/\/(tt\d+)/.exec(guid);
    if (imdb) ids.imdbId ??= imdb[1];
  }
  return ids;
}

/** JSON fetch with a hard timeout; any transport failure becomes a HistorySourceError. */
export async function readJson(fetcher: Fetcher, url: string, init: RequestInit, timeoutMs: number, label: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, { ...init, signal: controller.signal });
    if (response.status === 401 || response.status === 403) throw new HistorySourceError(`${label} rejected the credentials`, 401);
    if (!response.ok) throw new HistorySourceError(`${label} returned ${response.status}`, 502);
    return await response.json();
  } catch (error) {
    if (error instanceof HistorySourceError) throw error;
    throw new HistorySourceError(`${label} could not be reached`, 502);
  } finally { clearTimeout(timer); }
}

export const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
export const records = (value: unknown, max = 100_000): Record<string, unknown>[] =>
  Array.isArray(value) ? value.slice(0, max).map(record).filter((entry): entry is Record<string, unknown> => Boolean(entry)) : [];
export const text = (value: unknown, max = 500): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : typeof value === 'number' ? String(value) : undefined;
export const integer = (value: unknown): number | undefined => {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? Math.trunc(parsed) : undefined;
};
/** Unix seconds → ISO string, the shape the importer expects. */
export const secondsToIso = (value: unknown): string | undefined => {
  const seconds = integer(value);
  return seconds && seconds > 0 ? new Date(seconds * 1000).toISOString() : undefined;
};
