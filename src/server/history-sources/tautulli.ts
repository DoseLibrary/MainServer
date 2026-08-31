import { z } from 'zod';
import type { WatchDataProgressEntry } from '../watch-data-service.ts';
import { HistorySourceError, idsFromGuids, integer, readJson, record, records, secondsToIso, text, type Fetcher, type HistorySource, type HistorySourceResult } from './types.ts';

export const tautulliConfig = z.object({
  baseUrl: z.string().trim().url().max(500),
  apiKey: z.string().trim().min(1).max(200),
  /** Import only this Plex user's history; omit for the whole server's history. */
  userId: z.string().trim().min(1).max(64).optional(),
  maxRecords: z.number().int().min(1).max(20_000).optional(),
});
export type TautulliConfig = z.infer<typeof tautulliConfig>;

const PAGE_SIZE = 500;

/**
 * Reads playback history out of Tautulli. Unlike the Plex adapter this reaches every
 * Plex Home user's history, but only back to when Tautulli started logging, and
 * provider ids need one `get_metadata` call per rating key (cached per import).
 */
export class TautulliHistorySource implements HistorySource<TautulliConfig> {
  readonly id = 'tautulli';

  constructor(private readonly fetcher: Fetcher = fetch, private readonly timeoutMs = 15_000) {}

  async read(config: TautulliConfig): Promise<HistorySourceResult> {
    const base = config.baseUrl.replace(/\/+$/, '');
    const limit = config.maxRecords ?? 5000;
    const entries: WatchDataProgressEntry[] = [];
    const errors: string[] = [];
    const guidCache = new Map<string, { tmdbId?: string; imdbId?: string }>();

    for (let start = 0; start < limit; start += PAGE_SIZE) {
      const length = Math.min(PAGE_SIZE, limit - start);
      const payload = await this.command(base, config.apiKey, 'get_history', {
        start: String(start), length: String(length), ...(config.userId ? { user_id: config.userId } : {}),
      });
      const rows = records(record(record(payload)?.response)?.data ? record(record(record(payload)?.response)?.data)?.data : undefined);
      if (rows.length === 0) break;

      for (const row of rows) {
        const mediaType = text(row.media_type, 32);
        if (mediaType !== 'movie' && mediaType !== 'episode') continue;
        const title = text(row.title) ?? text(row.full_title);
        const ratingKey = text(row.rating_key, 64);
        if (!title || !ratingKey) continue;
        let ids = guidCache.get(ratingKey);
        if (!ids) {
          try { ids = await this.idsFor(base, config.apiKey, ratingKey); }
          catch (error) { ids = {}; errors.push(error instanceof Error ? `${title}: ${error.message}` : `${title}: ids unavailable`); }
          guidCache.set(ratingKey, ids);
        }
        entries.push({
          match: { ...ids, title, year: integer(row.year), kind: mediaType === 'movie' ? 'movie' : 'episode' },
          positionSeconds: Math.max(0, integer(row.view_offset) ?? 0),
          watched: text(row.watched_status) === '1' || integer(row.watched_status) === 1,
          lastWatchedAt: secondsToIso(row.stopped ?? row.date),
        });
      }
      if (rows.length < length) break;
    }
    return { entries, errors };
  }

  private async idsFor(base: string, apiKey: string, ratingKey: string) {
    const payload = await this.command(base, apiKey, 'get_metadata', { rating_key: ratingKey });
    const data = record(record(record(payload)?.response)?.data);
    const guids = records(data?.guids).flatMap((guid) => { const value = text(guid.id, 200); return value ? [value] : []; })
      .concat((Array.isArray(data?.guids) ? data.guids : []).flatMap((guid) => typeof guid === 'string' ? [guid] : []));
    const ids = idsFromGuids(guids);
    if (!ids.tmdbId && !ids.imdbId) {
      const guid = text(data?.guid, 200);
      if (guid) return idsFromGuids([guid]);
    }
    return ids;
  }

  private async command(base: string, apiKey: string, cmd: string, params: Record<string, string>) {
    const query = new URLSearchParams({ apikey: apiKey, cmd, ...params });
    const payload = await readJson(this.fetcher, `${base}/api/v2?${query.toString()}`, { headers: { Accept: 'application/json' } }, this.timeoutMs, 'Tautulli');
    const result = text(record(record(payload)?.response)?.result, 32);
    if (result && result !== 'success') throw new HistorySourceError(`Tautulli rejected the request (${result})`, 400);
    return payload;
  }
}
