import { z } from 'zod';
import type { WatchDataProgressEntry } from '../watch-data-service.ts';
import { HistorySourceError, idsFromGuids, integer, readJson, record, records, secondsToIso, text, type Fetcher, type HistorySource, type HistorySourceResult } from './types.ts';

export const plexConfig = z.object({
  baseUrl: z.string().trim().url().max(500),
  token: z.string().trim().min(1).max(200),
  sections: z.array(z.string().trim().min(1).max(32)).max(50).optional(),
});
export type PlexConfig = z.infer<typeof plexConfig>;

/**
 * Reads watch state straight off a Plex Media Server: one call per library section,
 * plus an episode-level call for show sections. Only the token owner's state is
 * visible to Plex here — Tautulli is the source that reaches other household users.
 */
export class PlexHistorySource implements HistorySource<PlexConfig> {
  readonly id = 'plex';

  constructor(private readonly fetcher: Fetcher = fetch, private readonly timeoutMs = 15_000) {}

  async read(config: PlexConfig): Promise<HistorySourceResult> {
    const base = config.baseUrl.replace(/\/+$/, '');
    const sections = await this.sections(base, config.token);
    const wanted = config.sections?.length ? sections.filter((section) => config.sections!.includes(section.key)) : sections;
    if (wanted.length === 0) throw new HistorySourceError('No movie or show libraries were found on this Plex server', 400);

    const entries: WatchDataProgressEntry[] = [];
    const errors: string[] = [];
    for (const section of wanted) {
      // Show sections are read at episode level (type=4) so per-episode progress survives.
      const url = `${base}/library/sections/${encodeURIComponent(section.key)}/all${section.kind === 'show' ? '?type=4' : ''}`;
      try {
        const payload = await this.get(url, config.token, 'Plex');
        for (const item of records(record(record(payload)?.MediaContainer)?.Metadata)) {
          const entry = toEntry(item, section.kind);
          if (entry) entries.push(entry);
        }
      } catch (error) {
        // One unreadable section is reported, not fatal — the rest still imports.
        errors.push(error instanceof Error ? `${section.title}: ${error.message}` : `${section.title}: unreadable`);
      }
    }
    return { entries, errors };
  }

  private async sections(base: string, token: string) {
    const payload = await this.get(`${base}/library/sections`, token, 'Plex');
    return records(record(record(payload)?.MediaContainer)?.Directory).flatMap((directory) => {
      const key = text(directory.key, 32);
      const type = text(directory.type, 32);
      if (!key || (type !== 'movie' && type !== 'show')) return [];
      return [{ key, kind: type as 'movie' | 'show', title: text(directory.title) ?? key }];
    });
  }

  private get(url: string, token: string, label: string) {
    return readJson(this.fetcher, url, { headers: { 'X-Plex-Token': token, Accept: 'application/json' } }, this.timeoutMs, label);
  }
}

function toEntry(item: Record<string, unknown>, sectionKind: 'movie' | 'show'): WatchDataProgressEntry | null {
  const title = text(item.title);
  if (!title) return null;
  const plexType = text(item.type, 32);
  // Episodes carry their own guids; a show section item without them is series-level.
  const kind = plexType === 'episode' ? 'episode' : plexType === 'show' ? 'series' : sectionKind === 'show' ? 'series' : 'movie';
  const guids = records(item.Guid).flatMap((guid) => { const value = text(guid.id, 200); return value ? [value] : []; });
  const ids = idsFromGuids(guids);
  const viewCount = integer(item.viewCount) ?? 0;
  const viewOffset = integer(item.viewOffset) ?? 0;
  if (viewCount === 0 && viewOffset === 0) return null;
  return {
    match: { ...ids, title, year: integer(item.year), kind },
    positionSeconds: Math.max(0, Math.round(viewOffset / 1000)),
    watched: viewCount > 0,
    lastWatchedAt: secondsToIso(item.lastViewedAt),
  };
}
