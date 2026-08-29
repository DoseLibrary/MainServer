import { Semaphore } from './concurrency.ts';

type Sleep = (ms: number) => Promise<void>;
type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;
type MediaKind = 'movie' | 'series';

export type TmdbGenre = { id: number; name: string };
export type TmdbCastCredit = { personId: number; name: string; character?: string; order: number; profilePath?: string };
export type TmdbRecommendation = { id: number; kind: MediaKind; title: string; year?: number; posterPath?: string };
export type TmdbCollectionSummary = { id: number; name: string; posterPath?: string; backdropPath?: string };

export type TmdbMetadata = {
  id: number;
  kind: MediaKind;
  title: string;
  originalTitle?: string;
  overview?: string;
  releaseDate?: string;
  year?: number;
  tagline?: string;
  runtimeMinutes?: number;
  contentRating?: string;
  rating?: number;
  posterPath?: string;
  backdropPath?: string;
  /** Transparent title logo (PNG), English preferred, for hero billboards. */
  logoPath?: string;
  genres: TmdbGenre[];
  cast: TmdbCastCredit[];
  recommendations: TmdbRecommendation[];
  collection?: TmdbCollectionSummary;
  externalIds: Record<string, string>;
};

export type TmdbSeasonMetadata = {
  id: number;
  seriesId: number;
  seasonNumber: number;
  title: string;
  overview?: string;
  airDate?: string;
  year?: number;
  posterPath?: string;
  episodes: TmdbEpisodeMetadata[];
};

export type TmdbEpisodeMetadata = {
  id: number;
  seriesId: number;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  overview?: string;
  airDate?: string;
  year?: number;
  runtimeMinutes?: number;
  rating?: number;
  stillPath?: string;
};

export type TmdbCollectionMetadata = TmdbCollectionSummary & {
  overview?: string;
  parts: Array<{ id: number; title: string; releaseDate?: string; year?: number; posterPath?: string; backdropPath?: string }>;
};
export type TmdbVideo = { id: string; key: string; site: string; name: string; type: string; official: boolean; language?: string; country?: string; publishedAt?: Date };

const text = (input: unknown, max: number) => typeof input === 'string' && input.trim() ? input.trim().slice(0, max) : undefined;
const image = (input: unknown) => typeof input === 'string' && /^\/[A-Za-z0-9._/-]{1,255}$/.test(input) ? input : undefined;
const integer = (input: unknown, min = 0) => typeof input === 'number' && Number.isInteger(input) && input >= min ? input : undefined;
const finite = (input: unknown, min = 0) => typeof input === 'number' && Number.isFinite(input) && input >= min ? input : undefined;
const record = (input: unknown): Record<string, unknown> | undefined => input !== null && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : undefined;
const records = (input: unknown, max = 100) => Array.isArray(input) ? input.slice(0, max).map(record).filter((v): v is Record<string, unknown> => Boolean(v)) : [];
const date = (input: unknown) => { const value = text(input, 10); return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined; };
const yearOf = (value?: string) => value && /^\d{4}/.test(value) ? Number(value.slice(0, 4)) : undefined;

export class TmdbClient {
  private readonly semaphore: Semaphore;
  private readonly rateGate = new Semaphore(1);
  private readonly cache = new Map<string, { expiresAt: number; pending: Promise<unknown> }>();
  private nextRequestAt = 0;
  private pausedUntil = 0;

  constructor(private readonly token: string, concurrency = 4, private readonly requestsPerSecond = 8, private readonly timeoutMs = 8000, private readonly fetcher: Fetcher = fetch, private readonly sleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), private readonly now = Date.now) {
    this.semaphore = new Semaphore(concurrency);
  }

  find(kind: MediaKind, title: string, year?: number): Promise<TmdbMetadata | null> {
    const key = `find:${kind}:${title.toLowerCase()}:${year ?? ''}`;
    return this.cached(key, () => this.search(kind, title, year));
  }

  /** Fetch by known provider id so a refresh keeps the same match, just updated. */
  getById(kind: MediaKind, id: number): Promise<TmdbMetadata | null> {
    if (!integer(id, 1)) return Promise.resolve(null);
    return this.cached(`detail:${kind}:${id}`, () => this.fetchById(kind, id));
  }

  /** Fetch videos only by an already matched provider id; never title-searches. */
  getVideos(kind: MediaKind, id: number): Promise<TmdbVideo[]> {
    if (!integer(id, 1)) return Promise.resolve([]);
    return this.cached(`videos:${kind}:${id}`, async () => {
      const media = kind === 'series' ? 'tv' : 'movie';
      const body = await this.json(`https://api.themoviedb.org/3/${media}/${id}/videos`);
      return records(body?.results, 200).flatMap((value) => {
        const id = text(value.id, 200); const key = text(value.key, 200); const site = text(value.site, 50); const name = text(value.name, 500); const type = text(value.type, 50);
        if (!id || !key || !site || !name || !type) return [];
        const published = text(value.published_at, 50);
        return [{ id, key, site, name, type, official: value.official === true, language: text(value.iso_639_1, 10), country: text(value.iso_3166_1, 10), publishedAt: published && !Number.isNaN(Date.parse(published)) ? new Date(published) : undefined }];
      });
    }).then((value) => value ?? []);
  }

  private async fetchById(kind: MediaKind, id: number): Promise<TmdbMetadata | null> {
    const media = kind === 'series' ? 'tv' : 'movie';
    const append = kind === 'movie' ? 'credits,recommendations,release_dates,external_ids,images' : 'credits,recommendations,content_ratings,external_ids,images';
    const detail = await this.json(`https://api.themoviedb.org/3/${media}/${id}?append_to_response=${append}&include_image_language=en,null`);
    if (!detail) return null;
    return this.mapMetadata(kind, id, text(detail.title ?? detail.name, 500) ?? String(id), detail, detail);
  }

  getSeason(seriesId: number, seasonNumber: number): Promise<TmdbSeasonMetadata | null> {
    return this.cached(`season:${seriesId}:${seasonNumber}`, () => this.fetchSeason(seriesId, seasonNumber));
  }

  getEpisode(seriesId: number, seasonNumber: number, episodeNumber: number): Promise<TmdbEpisodeMetadata | null> {
    return this.cached(`episode:${seriesId}:${seasonNumber}:${episodeNumber}`, () => this.fetchEpisode(seriesId, seasonNumber, episodeNumber));
  }

  getCollection(collectionId: number): Promise<TmdbCollectionMetadata | null> {
    return this.cached(`collection:${collectionId}`, () => this.fetchCollection(collectionId));
  }

  private cached<T>(key: string, load: () => Promise<T | null>): Promise<T | null> {
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > this.now()) return cached.pending as Promise<T | null>;
    if (cached) this.cache.delete(key);
    if (this.cache.size >= 1000) this.cache.delete(this.cache.keys().next().value as string);
    const pending = this.semaphore.run(load);
    this.cache.set(key, { expiresAt: this.now() + 3_600_000, pending });
    void pending.then((value) => { if (!value) this.cache.delete(key); }, () => this.cache.delete(key));
    return pending;
  }

  private async json(url: string): Promise<Record<string, unknown> | null> {
    const response = await this.request(url);
    if (!response) return null;
    try { return record(await response.json()) ?? null; } catch { return null; }
  }

  private async search(kind: MediaKind, title: string, year?: number): Promise<TmdbMetadata | null> {
    const media = kind === 'series' ? 'tv' : 'movie';
    const query = new URLSearchParams({ query: title });
    if (year) query.set(kind === 'series' ? 'first_air_date_year' : 'year', String(year));
    const searchBody = await this.json(`https://api.themoviedb.org/3/search/${media}?${query}`);
    const value = records(searchBody?.results, 20)[0];
    const id = integer(value?.id, 1);
    if (!value || !id) return null;
    const append = kind === 'movie' ? 'credits,recommendations,release_dates,external_ids,images' : 'credits,recommendations,content_ratings,external_ids,images';
    const detail = await this.json(`https://api.themoviedb.org/3/${media}/${id}?append_to_response=${append}&include_image_language=en,null`) ?? value;
    return this.mapMetadata(kind, id, title, value, detail);
  }

  private mapMetadata(kind: MediaKind, id: number, fallbackTitle: string, search: Record<string, unknown>, detail: Record<string, unknown>): TmdbMetadata {
    const title = text(detail.title ?? detail.name ?? search.title ?? search.name, 500) ?? fallbackTitle.slice(0, 500);
    const releaseDate = date(detail.release_date ?? detail.first_air_date ?? search.release_date ?? search.first_air_date);
    const credits = record(detail.credits);
    const recommendationBody = record(detail.recommendations);
    const collection = record(detail.belongs_to_collection);
    const external = record(detail.external_ids);
    return {
      id, kind, title,
      originalTitle: text(detail.original_title ?? detail.original_name, 500),
      overview: text(detail.overview ?? search.overview, 10_000),
      releaseDate, year: yearOf(releaseDate), tagline: text(detail.tagline, 1_000),
      runtimeMinutes: this.runtime(kind, detail), contentRating: this.contentRating(kind, detail), rating: finite(detail.vote_average, 0),
      posterPath: image(detail.poster_path ?? search.poster_path), backdropPath: image(detail.backdrop_path ?? search.backdrop_path), logoPath: this.pickLogo(detail),
      genres: records(detail.genres, 50).flatMap((genre) => { const genreId = integer(genre.id, 1); const name = text(genre.name, 100); return genreId && name ? [{ id: genreId, name }] : []; }),
      cast: records(credits?.cast, 100).flatMap((credit, index) => { const personId = integer(credit.id, 1); const name = text(credit.name, 300); if (!personId || !name) return []; return [{ personId, name, character: text(credit.character, 500), order: integer(credit.order) ?? index, profilePath: image(credit.profile_path) }]; }).sort((a, b) => a.order - b.order),
      recommendations: records(recommendationBody?.results, 100).flatMap((item) => this.mapRecommendation(item, kind)),
      collection: collection ? this.mapCollectionSummary(collection) : undefined,
      externalIds: Object.fromEntries(Object.entries(external ?? {}).flatMap(([key, value]) => { const safeKey = /^[a-z0-9_]{1,50}$/i.test(key) ? key : undefined; const safeValue = typeof value === 'number' ? String(value) : text(value, 200); return safeKey && safeValue ? [[safeKey, safeValue]] : []; })),
    };
  }

  /** Pick a title logo: English first, then language-agnostic, then whatever exists. */
  private pickLogo(detail: Record<string, unknown>): string | undefined {
    const logos = records(record(detail.images)?.logos, 50).filter((logo) => image(logo.file_path));
    const chosen = logos.find((logo) => logo.iso_639_1 === 'en') ?? logos.find((logo) => !logo.iso_639_1) ?? logos[0];
    return chosen ? image(chosen.file_path) : undefined;
  }

  private runtime(kind: MediaKind, detail: Record<string, unknown>) {
    if (kind === 'movie') return integer(detail.runtime, 1);
    return (Array.isArray(detail.episode_run_time) ? detail.episode_run_time : []).map((value) => integer(value, 1)).find(Boolean);
  }

  private contentRating(kind: MediaKind, detail: Record<string, unknown>) {
    const container = record(detail[kind === 'movie' ? 'release_dates' : 'content_ratings']);
    const results = records(container?.results, 100);
    const preferred = results.find((entry) => entry.iso_3166_1 === 'US') ?? results[0];
    if (kind === 'series') return text(preferred?.rating, 20);
    const releases = records(preferred?.release_dates, 30);
    return releases.map((entry) => text(entry.certification, 20)).find(Boolean);
  }

  private mapRecommendation(item: Record<string, unknown>, fallbackKind: MediaKind): TmdbRecommendation[] {
    const id = integer(item.id, 1); const title = text(item.title ?? item.name, 500);
    if (!id || !title) return [];
    const kind = item.media_type === 'tv' ? 'series' : item.media_type === 'movie' ? 'movie' : fallbackKind;
    const releaseDate = date(item.release_date ?? item.first_air_date);
    return [{ id, kind, title, year: yearOf(releaseDate), posterPath: image(item.poster_path) }];
  }

  private mapCollectionSummary(value: Record<string, unknown>): TmdbCollectionSummary | undefined {
    const id = integer(value.id, 1); const name = text(value.name, 500);
    return id && name ? { id, name, posterPath: image(value.poster_path), backdropPath: image(value.backdrop_path) } : undefined;
  }

  private async fetchSeason(seriesId: number, seasonNumber: number): Promise<TmdbSeasonMetadata | null> {
    if (!integer(seriesId, 1) || integer(seasonNumber) === undefined) return null;
    const value = await this.json(`https://api.themoviedb.org/3/tv/${seriesId}/season/${seasonNumber}`);
    const id = integer(value?.id, 1); if (!value || !id) return null;
    const airDate = date(value.air_date);
    return { id, seriesId, seasonNumber: integer(value.season_number) ?? seasonNumber, title: text(value.name, 500) ?? `Season ${seasonNumber}`, overview: text(value.overview, 10_000), airDate, year: yearOf(airDate), posterPath: image(value.poster_path), episodes: records(value.episodes, 1000).flatMap((episode) => this.mapEpisode(seriesId, seasonNumber, episode)) };
  }

  private async fetchEpisode(seriesId: number, seasonNumber: number, episodeNumber: number): Promise<TmdbEpisodeMetadata | null> {
    if (!integer(seriesId, 1) || integer(seasonNumber) === undefined || !integer(episodeNumber, 1)) return null;
    const value = await this.json(`https://api.themoviedb.org/3/tv/${seriesId}/season/${seasonNumber}/episode/${episodeNumber}?append_to_response=external_ids`);
    return value ? this.mapEpisode(seriesId, seasonNumber, value)[0] ?? null : null;
  }

  private mapEpisode(seriesId: number, fallbackSeason: number, value: Record<string, unknown>): TmdbEpisodeMetadata[] {
    const id = integer(value.id, 1); const episodeNumber = integer(value.episode_number, 1); const title = text(value.name, 500);
    if (!id || !episodeNumber || !title) return [];
    const airDate = date(value.air_date);
    return [{ id, seriesId, seasonNumber: integer(value.season_number) ?? fallbackSeason, episodeNumber, title, overview: text(value.overview, 10_000), airDate, year: yearOf(airDate), runtimeMinutes: integer(value.runtime, 1), rating: finite(value.vote_average), stillPath: image(value.still_path) }];
  }

  private async fetchCollection(collectionId: number): Promise<TmdbCollectionMetadata | null> {
    if (!integer(collectionId, 1)) return null;
    const value = await this.json(`https://api.themoviedb.org/3/collection/${collectionId}`);
    if (!value) return null;
    const summary = this.mapCollectionSummary(value); if (!summary) return null;
    return { ...summary, overview: text(value.overview, 10_000), parts: records(value.parts, 1000).flatMap((part) => { const id = integer(part.id, 1); const title = text(part.title, 500); if (!id || !title) return []; const releaseDate = date(part.release_date); return [{ id, title, releaseDate, year: yearOf(releaseDate), posterPath: image(part.poster_path), backdropPath: image(part.backdrop_path) }]; }) };
  }

  private async request(url: string): Promise<Response | null> {
    for (let attempt = 0; attempt < 4; attempt++) {
      await this.rateGate.run(async () => { const wait = Math.max(0, this.nextRequestAt - this.now(), this.pausedUntil - this.now()); if (wait) await this.sleep(wait); this.nextRequestAt = this.now() + Math.ceil(1000 / this.requestsPerSecond); });
      const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await this.fetcher(url, { headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/json' }, signal: controller.signal });
        if (response.ok) return response;
        if (response.status !== 429 && response.status < 500) return null;
        const header = response.headers.get('retry-after'); const seconds = header ? Number(header) : Number.NaN; const dateDelay = header ? Date.parse(header) - this.now() : Number.NaN; const delay = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : Number.isFinite(dateDelay) && dateDelay > 0 ? dateDelay : 250 * 2 ** attempt + Math.floor(Math.random() * 100);
        if (response.status === 429) this.pausedUntil = Math.max(this.pausedUntil, this.now() + delay);
        await this.sleep(delay);
      } catch { if (attempt === 3) return null; await this.sleep(250 * 2 ** attempt); }
      finally { clearTimeout(timer); }
    }
    return null;
  }
}
