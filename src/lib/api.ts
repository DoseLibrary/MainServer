export interface User {
  id: string;
  username: string;
  role?: 'admin' | 'member';
  /** Highest maturity level this account may watch; null means no limit. */
  maxMaturityLevel?: number | null;
}

export interface ManagedUser extends Required<Omit<User, 'maxMaturityLevel'>> {
  disabled: boolean;
  createdAt: string;
  updatedAt: string;
  maxMaturityLevel: number | null;
}

export type SubtitleBackground = 'none' | 'shadow' | 'box';

export interface UserSettings {
  showCollectionGaps: boolean;
  /** Remembered playback rate, as a percentage of normal speed. */
  playbackSpeedPercent: number;
  /** Caption size, as a percentage of the player's default. */
  subtitleSizePercent: number;
  subtitleBackground: SubtitleBackground;
}

export interface Library {
  id: string;
  name: string;
  kind?: 'movies' | 'shows';
  rootPath?: string;
  enabled?: boolean;
}

export interface CatalogItem {
  id: string;
  title: string;
  year?: number;
  kind: string;
  posterUrl?: string;
  backdropUrl?: string;
  /** Transparent title logo for hero billboards, when available. */
  logoUrl?: string;
  overview?: string;
  progress?: number;
  seasonNumber?: number;
  episodeNumber?: number;
  /** Quality badge such as `4K HDR`, present when a technical profile exists. */
  badge?: string;
  genres?: string[];
  /** Collection name, when the title belongs to one. */
  collection?: string;
  /** Set on the home hero when a locally-downloaded trailer can play as its background. */
  hasLocalTrailer?: boolean;
  children?: CatalogItem[];
}

export interface CatalogGenre { id: string; name: string }
export interface CatalogCollection { id: string; name: string; posterUrl?: string }
export interface CatalogCastMember { id?: string; name: string; character?: string; profileUrl?: string; order: number }
export interface CatalogPerson { id: string; name: string; profileUrl?: string; titles: Array<CatalogItem & { character?: string }> }
export interface CatalogGenreView { id: string; name: string; titles: CatalogItem[] }
export interface CatalogCategorySummary { key: string; name: string; count: number }
export interface CatalogCategoryView { key: string; name: string; titles: CatalogItem[] }
export interface WatchDataMatch { tmdbId?: string; imdbId?: string; title: string; year?: number; kind: string }
export interface WatchDataDocument {
  version: 1;
  exportedAt?: string;
  progress: Array<{ match: WatchDataMatch; positionSeconds: number; watched: boolean; lastWatchedAt?: string }>;
  watchlist: Array<{ match: WatchDataMatch }>;
  collections: Array<{ name: string; overview?: string; items: WatchDataMatch[] }>;
}
export interface WatchDataImportSummary { matched: number; written: number; unmatched: WatchDataMatch[] }
export type HistorySourceId = 'plex' | 'trakt' | 'tautulli';
export type HistorySourceConfig =
  | { baseUrl: string; token: string; sections?: string[] }
  | { clientId: string; accessToken: string }
  | { baseUrl: string; apiKey: string; userId?: string };
export interface HistoryImportSummary extends WatchDataImportSummary { skipped: number; errors: string[] }
export interface QueueItem extends CatalogItem { unavailable?: boolean }
export interface UserCollectionSummary { id: string; name: string; overview?: string; itemCount: number }
export interface UserCollectionView { id: string; name: string; overview?: string; items: CatalogItem[] }
export interface CatalogCollectionGap { tmdbId: string; title: string; year?: number; releaseDate?: string; posterUrl?: string; inLibrary: false }
export interface CatalogCollectionView { id: string; name: string; posterUrl?: string; titles: CatalogItem[]; missing?: CatalogCollectionGap[] }
export interface ArtworkOption { path: string; previewUrl: string }
export interface ArtworkOptions { posters: ArtworkOption[]; backdrops: ArtworkOption[] }
export interface TmdbTitleCandidate { id: number; title: string; year?: number; overview?: string; posterPath?: string }
export interface AdminMediaItem { id: string; title: string; year?: number; kind: string; library: string; archived: boolean; archivedAt: string | null; posterUrl?: string; tmdbId?: string }
export interface AdminMediaList { items: AdminMediaItem[]; total: number }
export interface CatalogQuality { badge?: string; resolutionLabel: string | null; dynamicRange: string | null; videoCodec: string | null; audioCodec: string | null; audioChannels: string | null }

/** Full detail view model; every enriched field is optional so partial metadata renders. */
export interface CatalogItemDetails extends Omit<CatalogItem, 'genres' | 'collection'> {
  originalTitle?: string;
  releaseDate?: string;
  tagline?: string;
  contentRating?: string;
  providerRating?: number;
  runtime?: string;
  quality?: CatalogQuality;
  genres?: CatalogGenre[];
  collection?: CatalogCollection;
  cast?: CatalogCastMember[];
  recommendations?: CatalogItem[];
  files?: Array<{ id: string; relativePath: string; durationSeconds?: number }>;
  trailers?: CatalogTrailer[];
  subtitles?: CatalogSubtitle[];
  /** Next episode in the series, for autoplay when this one ends. */
  nextEpisodeId?: string;
  /** Details for the next episode, used by the player's up-next card. */
  nextEpisode?: { id: string; title: string; seasonNumber?: number; episodeNumber?: number; posterUrl?: string };
  /** Whether the current user has saved this title to their watch list. */
  inWatchlist?: boolean;
  /** Whether the current user has marked this title watched. */
  watched?: boolean;
}

export interface CatalogTrailer { site: string; key: string; name: string; type: string; official: boolean; preferred: boolean; localAvailable?: boolean }
export interface CatalogSubtitle { id: string; language?: string; label: string; forced: boolean; url: string }
export interface MediaSprite { src: string; columns: number; rows: number; interval: number; tileWidth: number; tileHeight: number }
export interface DevicePairing {
  userCode: string;
  deviceCode: string;
  deviceName: string;
  expiresAt: string;
  intervalMs: number;
  verificationPath: string;
  verificationPathComplete: string;
}
export interface DeviceAuthRequest { id: string; deviceName: string; status: 'pending' | 'approved' | 'denied'; expiresAt: string; createdAt: string }
export type DevicePollStatus = { status: 'pending' | 'denied' } | { status: 'approved'; user: User };
export interface DeviceSession {
  id: string;
  deviceName: string | null;
  createdVia: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  /** True for the session making the request, which cannot be revoked from the list. */
  current: boolean;
}

export interface ActivitySession {
  id: string;
  username: string;
  deviceName: string | null;
  playMethod: 'direct' | 'remux' | 'transcode';
  positionSeconds: number;
  durationSeconds: number | null;
  paused: boolean;
  startedAt: string;
  lastReportedAt: string;
  item: { id: string; title: string; kind: string; seasonNumber?: number; episodeNumber?: number; posterUrl?: string; backdropUrl?: string };
}

export interface HistoryEntry {
  id: string;
  watchedAt: string;
  startedAt: string;
  deviceName: string | null;
  positionSeconds: number;
  durationSeconds: number | null;
  item: { id: string; title: string; kind: string; seasonNumber?: number; episodeNumber?: number; posterUrl?: string; backdropUrl?: string };
}

export interface DownloadGrant {
  id: string;
  mediaItemId: string;
  title: string;
  profile: 'sd' | 'hd';
  status: 'preparing' | 'ready' | 'claimed' | 'failed';
  sizeBytes: number | null;
  estimatedBytes: number;
  error: string | null;
  expiresAt: string;
}

export interface DownloadEstimate {
  items: Array<{ id: string; title: string; estimatedBytes: number }>;
  totalBytes: number;
  profile: 'sd' | 'hd';
}

export interface IntroMarker { startSeconds: number; endSeconds: number }

export interface CatalogSection { id: string; title: string; items: CatalogItem[]; layout?: 'poster' | 'card' }
export interface CatalogHome { sections: CatalogSection[]; featured?: CatalogItem }
export interface RandomItemFilters { kind?: 'movie' | 'series'; genre?: string; yearMin?: number; yearMax?: number; ratingMin?: number }
export interface CatalogSearchItem { id: string; title: string; year?: number; posterUrl?: string; kind: string; meta?: string; badge?: string; genres?: string[] }
export interface CatalogSearch { query: string; groups: Array<{ id: string; label: string; items: CatalogSearchItem[] }> }
export interface ClientCapabilities { containers: string[]; videoCodecs: string[]; audioCodecs: string[]; maxHeight?: number; maxBitrate?: number }
export interface AudioTrack { index: number; label: string; language?: string; codec?: string; channels?: number; default: boolean }

export interface PlaybackResponse {
  /** Selectable audio tracks of the file, in file order. */
  audioTracks?: AudioTrack[];
  plan: { mode: 'direct' | 'transcode'; container: string; remux: boolean; audioTrackIndex?: number; reasons: string[] };
  durationSeconds?: number;
  stream: { url: string; castUrl?: string; direct: boolean; /** HLS entry point for re-encoded transcodes: seekable, with a quality ladder. */ hlsUrl?: string };
}
export interface HealthStatus { status: 'ok' | 'degraded'; database: 'ok' | 'unavailable'; metadata?: { tmdb: 'configured' | 'not_configured' } }
export interface LibraryScan {
  id: string; libraryId: string; status: 'queued' | 'running' | 'completed' | 'failed';
  discoveredFiles?: number; processedFiles?: number; matchedItems?: number; error?: string;
  startedAt?: string; completedAt?: string;
}

export type PluginRunStatus = 'running' | 'succeeded' | 'failed';
/** Mirrors PluginFieldDescriptor on the server; the plugin declares it, the admin form renders it. */
export type PluginField =
  | { kind: 'text' | 'password' | 'path'; key: string; label: string; description?: string; placeholder?: string; required?: boolean; group?: string }
  | { kind: 'number'; key: string; label: string; description?: string; min?: number; max?: number; step?: number; required?: boolean; group?: string }
  | { kind: 'boolean'; key: string; label: string; description?: string; group?: string }
  | { kind: 'select' | 'multiselect'; key: string; label: string; description?: string; options: { value: string; label: string }[]; group?: string }
  | { kind: 'list'; key: string; label: string; description?: string; placeholder?: string; itemLabel?: string; group?: string };
export interface PluginAction { id: string; label: string; description?: string; confirm?: string }
export interface PluginSummary {
  id: string; name: string; description: string; version: string;
  fields: PluginField[];
  defaults: Record<string, unknown>;
  /** Password fields that already hold a stored value; the value itself is never sent. */
  secretsSet: string[];
  actions: PluginAction[];
  events: string[];
  runnable: boolean;
  enabled: boolean; schedule: string | null; settings: Record<string, unknown>;
  nextRunAt: string | null; lastRunAt: string | null; lastRunStatus: PluginRunStatus | null;
  lastRunDurationMs: number | null; lastRunSummary: string | null; lastRunError: string | null;
}
export interface PluginRun { id: string; pluginId: string; status: PluginRunStatus; startedAt: string; finishedAt: string | null; durationMs: number | null; summary: string | null; error: string | null }

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    /** Per-field messages when the server rejects a payload field by field. */
    public readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    let fieldErrors: Record<string, string> | undefined;
    try {
      const body = await response.json() as { message?: string; error?: string; errors?: Record<string, string> };
      message = body.message ?? body.error ?? message;
      fieldErrors = body.errors;
    } catch {
      // The status remains useful when the server returns an empty/non-JSON error.
    }
    throw new ApiError(message, response.status, fieldErrors);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  trailerUrl: (id: string) => `/api/v1/media/${encodeURIComponent(id)}/trailer`,
  mediaSprites: (id: string) => request<{ sprite: MediaSprite }>(`/api/v1/media/${encodeURIComponent(id)}/sprites`),
  mediaIntro: (id: string) => request<{ intro: IntroMarker | null }>(`/api/v1/media/${encodeURIComponent(id)}/intro`),
  health: () => request<HealthStatus>('/api/v1/health'),
  setupStatus: () => request<{ setupRequired: boolean }>('/api/v1/setup/status'),
  setup: (credentials: { username: string; password: string }) =>
    request<{ user: User }>('/api/v1/setup', { method: 'POST', body: JSON.stringify(credentials) }),
  login: (credentials: { username: string; password: string }) =>
    request<{ user: User }>('/api/v1/auth/login', { method: 'POST', body: JSON.stringify(credentials) }),
  logout: () => request<void>('/api/v1/auth/logout', { method: 'POST' }),
  startDevicePairing: (deviceName?: string) =>
    request<DevicePairing>('/api/v1/auth/device/start', { method: 'POST', body: JSON.stringify(deviceName ? { deviceName } : {}) }),
  pollDevicePairing: (deviceCode: string) =>
    request<DevicePollStatus>('/api/v1/auth/device/poll', { method: 'POST', body: JSON.stringify({ deviceCode }) }),
  deviceRequest: (code: string) => request<{ request: DeviceAuthRequest }>(`/api/v1/auth/device/${encodeURIComponent(code)}`),
  approveDevice: (code: string) => request<{ approved: { id: string; deviceName: string } }>(`/api/v1/auth/device/${encodeURIComponent(code)}/approve`, { method: 'POST' }),
  denyDevice: (code: string) => request<void>(`/api/v1/auth/device/${encodeURIComponent(code)}/deny`, { method: 'POST' }),
  sessions: () => request<{ sessions: DeviceSession[] }>('/api/v1/me/sessions'),
  startPlaybackSession: (input: { mediaItemId: string; playMethod?: 'direct' | 'remux' | 'transcode'; positionSeconds?: number; durationSeconds?: number }) =>
    request<{ session: { id: string } }>('/api/v1/playback/sessions', { method: 'POST', body: JSON.stringify(input) }),
  reportPlayback: (id: string, update: { positionSeconds?: number; paused?: boolean }) =>
    request<{ session: { id: string } }>(`/api/v1/playback/sessions/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify(update) }),
  endPlaybackSession: (id: string) => request<void>(`/api/v1/playback/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  activity: () => request<{ sessions: ActivitySession[] }>('/api/v1/admin/activity'),
  history: () => request<{ history: HistoryEntry[] }>('/api/v1/me/history'),
  downloads: () => request<{ downloads: DownloadGrant[] }>('/api/v1/downloads'),
  /** What a title, or a whole season, would cost on the device. */
  downloadEstimate: (mediaItemId: string, profile: 'sd' | 'hd') =>
    request<DownloadEstimate>(`/api/v1/downloads/estimate?mediaItemId=${encodeURIComponent(mediaItemId)}&profile=${profile}`),
  requestDownload: (mediaItemId: string, profile: 'sd' | 'hd') =>
    request<{ download: DownloadGrant }>('/api/v1/downloads', { method: 'POST', body: JSON.stringify({ mediaItemId, profile }) }),
  downloadStatus: (id: string) => request<{ download: DownloadGrant }>(`/api/v1/downloads/${encodeURIComponent(id)}`),
  completeDownload: (id: string) => request<void>(`/api/v1/downloads/${encodeURIComponent(id)}/complete`, { method: 'POST' }),
  cancelDownload: (id: string) => request<void>(`/api/v1/downloads/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  forgetHistory: (itemId?: string) => request<void>(`/api/v1/me/history${itemId ? `?itemId=${encodeURIComponent(itemId)}` : ''}`, { method: 'DELETE' }),
  revokeSession: (id: string) => request<void>(`/api/v1/me/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  me: () => request<{ user: User }>('/api/v1/auth/me'),
  getSettings: () => request<{ settings: UserSettings }>('/api/v1/me/settings'),
  updateSettings: (change: Partial<UserSettings>) => request<{ settings: UserSettings }>('/api/v1/me/settings', { method: 'PUT', body: JSON.stringify(change) }),
  libraries: () => request<{ libraries: Library[] }>('/api/v1/libraries'),
  createLibrary: (library: { name: string; kind: 'movies' | 'shows'; rootPath: string }) =>
    request<{ library: Library }>('/api/v1/libraries', { method: 'POST', body: JSON.stringify(library) }),
  deleteLibrary: (id: string) => request<void>(`/api/v1/libraries/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  searchTmdb: (type: 'movie' | 'series', query: string) => request<{ results: TmdbTitleCandidate[] }>(`/api/v1/admin/tmdb/search?type=${type}&q=${encodeURIComponent(query)}`),
  matchTmdb: (id: string, tmdbId: number) => request<{ item: { id: string; providerIds: Record<string, string> } }>(`/api/v1/admin/items/${encodeURIComponent(id)}/match`, { method: 'POST', body: JSON.stringify({ tmdbId }) }),
  adminMediaItems: (params: { archived?: boolean; sort?: 'title' | 'archivedAt'; direction?: 'asc' | 'desc'; limit?: number; offset?: number; q?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.archived !== undefined) query.set('archived', String(params.archived));
    if (params.sort) query.set('sort', params.sort);
    if (params.direction) query.set('direction', params.direction);
    if (params.limit != null) query.set('limit', String(params.limit));
    if (params.offset != null) query.set('offset', String(params.offset));
    if (params.q?.trim()) query.set('q', params.q.trim());
    const suffix = query.toString();
    return request<AdminMediaList>(`/api/v1/admin/items${suffix ? `?${suffix}` : ''}`);
  },
  deleteItem: (id: string) => request<void>(`/api/v1/admin/items/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  catalogHome: (libraryId?: string) => request<CatalogHome>(`/api/v1/catalog/home${libraryId ? `?libraryId=${encodeURIComponent(libraryId)}` : ''}`),
  randomItem: (filters: RandomItemFilters = {}) => {
    const query = new URLSearchParams();
    if (filters.kind) query.set('kind', filters.kind);
    if (filters.genre) query.set('genre', filters.genre);
    if (filters.yearMin != null) query.set('yearMin', String(filters.yearMin));
    if (filters.yearMax != null) query.set('yearMax', String(filters.yearMax));
    if (filters.ratingMin != null) query.set('ratingMin', String(filters.ratingMin));
    const suffix = query.toString();
    return request<{ item: CatalogItem & { providerRating?: number } }>(`/api/v1/catalog/random${suffix ? `?${suffix}` : ''}`);
  },
  exportWatchData: () => request<WatchDataDocument>('/api/v1/me/watch-data/export'),
  importWatchData: (document: WatchDataDocument) => request<{ summary: WatchDataImportSummary }>('/api/v1/me/watch-data/import', { method: 'POST', body: JSON.stringify(document) }),
  importHistory: (source: HistorySourceId, config: HistorySourceConfig) =>
    request<{ summary: HistoryImportSummary }>(`/api/v1/me/watch-data/import/${source}`, { method: 'POST', body: JSON.stringify(config) }),
  queue: () => request<{ items: QueueItem[] }>('/api/v1/me/queue'),
  addToQueue: (mediaItemId: string) => request<{ items: QueueItem[] }>('/api/v1/me/queue', { method: 'POST', body: JSON.stringify({ mediaItemId }) }),
  removeFromQueue: (mediaItemId: string) => request<{ items: QueueItem[] }>(`/api/v1/me/queue/${encodeURIComponent(mediaItemId)}`, { method: 'DELETE' }),
  clearQueue: () => request<{ items: QueueItem[] }>('/api/v1/me/queue', { method: 'DELETE' }),
  reorderQueue: (mediaItemIds: string[]) => request<{ items: QueueItem[] }>('/api/v1/me/queue', { method: 'PUT', body: JSON.stringify({ mediaItemIds }) }),
  nextInQueue: (after?: string) => request<{ item: CatalogItem | null }>(`/api/v1/me/queue/next${after ? `?after=${encodeURIComponent(after)}` : ''}`),
  userCollections: () => request<{ collections: UserCollectionSummary[] }>('/api/v1/me/collections'),
  userCollection: (id: string) => request<{ collection: UserCollectionView }>(`/api/v1/me/collections/${encodeURIComponent(id)}`),
  createUserCollection: (collection: { name: string; overview?: string }) =>
    request<{ collection: UserCollectionSummary }>('/api/v1/me/collections', { method: 'POST', body: JSON.stringify(collection) }),
  updateUserCollection: (id: string, patch: { name?: string; overview?: string | null }) =>
    request<{ collection: UserCollectionSummary }>(`/api/v1/me/collections/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteUserCollection: (id: string) => request<void>(`/api/v1/me/collections/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  addToUserCollection: (id: string, mediaItemId: string) =>
    request<{ collection: UserCollectionView }>(`/api/v1/me/collections/${encodeURIComponent(id)}/items`, { method: 'POST', body: JSON.stringify({ mediaItemId }) }),
  removeFromUserCollection: (id: string, mediaItemId: string) =>
    request<{ collection: UserCollectionView }>(`/api/v1/me/collections/${encodeURIComponent(id)}/items/${encodeURIComponent(mediaItemId)}`, { method: 'DELETE' }),
  reorderUserCollection: (id: string, mediaItemIds: string[]) =>
    request<{ collection: UserCollectionView }>(`/api/v1/me/collections/${encodeURIComponent(id)}/items`, { method: 'PUT', body: JSON.stringify({ mediaItemIds }) }),
  catalogItem: (id: string) => request<{ item: CatalogItemDetails }>(`/api/v1/catalog/items/${encodeURIComponent(id)}`),
  catalogPerson: (id: string) => request<{ person: CatalogPerson }>(`/api/v1/catalog/people/${encodeURIComponent(id)}`),
  catalogGenre: (id: string) => request<{ genre: CatalogGenreView }>(`/api/v1/catalog/genres/${encodeURIComponent(id)}`),
  catalogCategories: (libraryId?: string) => request<{ categories: CatalogCategorySummary[] }>(`/api/v1/catalog/categories${libraryId ? `?libraryId=${encodeURIComponent(libraryId)}` : ''}`),
  catalogCategory: (key: string) => request<{ category: CatalogCategoryView }>(`/api/v1/catalog/categories/${encodeURIComponent(key)}`),
  catalogCollection: (id: string) => request<{ collection: CatalogCollectionView }>(`/api/v1/catalog/collections/${encodeURIComponent(id)}`),
  artworkOptions: (id: string) => request<ArtworkOptions>(`/api/v1/catalog/items/${encodeURIComponent(id)}/artwork`),
  setArtwork: (id: string, change: { posterPath?: string | null; backdropPath?: string | null }) =>
    request<{ item: { id: string; posterUrl?: string; backdropUrl?: string } }>(`/api/v1/catalog/items/${encodeURIComponent(id)}/artwork`, { method: 'PATCH', body: JSON.stringify(change) }),
  catalogSearch: (libraryId: string | undefined, query: string) => request<CatalogSearch>(`/api/v1/catalog/search?${libraryId ? `libraryId=${encodeURIComponent(libraryId)}&` : ''}q=${encodeURIComponent(query)}`),
  playback: (id: string, capabilities: ClientCapabilities, audioTrackIndex?: number) => request<PlaybackResponse>(`/api/v1/catalog/items/${encodeURIComponent(id)}/playback`, { method: 'POST', body: JSON.stringify({ ...capabilities, ...(audioTrackIndex != null ? { audioTrackIndex } : {}) }) }),
  saveProgress: (id: string, positionSeconds: number, watched?: boolean) => request<{ mediaItemId: string; positionSeconds: number; watched: boolean }>(`/api/v1/catalog/items/${encodeURIComponent(id)}/progress`, { method: 'POST', body: JSON.stringify({ positionSeconds: Math.round(positionSeconds), ...(watched != null ? { watched } : {}) }) }),
  markWatched: (id: string, watched: boolean) => request<{ mediaItemId: string; positionSeconds: number; watched: boolean }>(`/api/v1/catalog/items/${encodeURIComponent(id)}/progress`, { method: 'POST', body: JSON.stringify({ watched }) }),
  setWatchlist: (id: string, saved: boolean) => request<{ mediaItemId: string; inWatchlist: boolean }>(`/api/v1/catalog/items/${encodeURIComponent(id)}/watchlist`, { method: saved ? 'POST' : 'DELETE' }),
  startLibraryScan: (id: string) => request<{ scan: LibraryScan }>(`/api/v1/libraries/${encodeURIComponent(id)}/scan`, { method: 'POST' }),
  refreshLibraryMetadata: (id: string, force = false) => request<{ libraryId: string; refreshed: number; failed: number }>(`/api/v1/libraries/${encodeURIComponent(id)}/refresh${force ? '?force=true' : ''}`, { method: 'POST' }),
  latestLibraryScan: (id: string) => request<{ scan: LibraryScan | null }>(`/api/v1/libraries/${encodeURIComponent(id)}/scans/latest`),
  users: () => request<{ users: ManagedUser[] }>('/api/v1/users'),
  createUser: (user: { username: string; password: string; role: 'admin' | 'member'; maxMaturityLevel?: number | null }) =>
    request<{ user: ManagedUser }>('/api/v1/users', { method: 'POST', body: JSON.stringify(user) }),
  updateUser: (id: string, change: { role?: 'admin' | 'member'; disabled?: boolean; password?: string; maxMaturityLevel?: number | null }) =>
    request<{ user: ManagedUser }>(`/api/v1/users/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(change) }),
  deleteUser: (id: string) => request<void>(`/api/v1/users/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  plugins: () => request<{ plugins: PluginSummary[] }>('/api/v1/plugins'),
  plugin: (id: string) => request<{ plugin: PluginSummary }>(`/api/v1/plugins/${encodeURIComponent(id)}`),
  runPluginAction: (id: string, actionId: string) =>
    request<{ run: { id: string; status: PluginRunStatus; durationMs: number; summary?: string | null; error?: string } }>(`/api/v1/plugins/${encodeURIComponent(id)}/actions/${encodeURIComponent(actionId)}`, { method: 'POST' }),
  pluginRuns: (id: string) => request<{ runs: PluginRun[] }>(`/api/v1/plugins/${encodeURIComponent(id)}/runs`),
  configurePlugin: (id: string, change: { enabled?: boolean; schedule?: string | null; settings?: Record<string, unknown> }) =>
    request<{ plugin: PluginSummary }>(`/api/v1/plugins/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(change) }),
  runPlugin: (id: string) => request<{ run: { id: string; status: PluginRunStatus; durationMs: number; summary?: string | null; error?: string } }>(`/api/v1/plugins/${encodeURIComponent(id)}/run`, { method: 'POST' }),
};

export function imageVariant(url: string | undefined, options: { width?: number; height?: number; fit?: 'cover' | 'contain' | 'inside'; format?: 'webp' | 'avif' | 'jpeg'; quality?: number }): string | undefined {
  if (!url || !url.startsWith('/api/v1/images/')) return url;
  const params = new URLSearchParams();
  if (options.width) params.set('w', String(options.width));
  if (options.height) params.set('h', String(options.height));
  if (options.fit) params.set('fit', options.fit);
  if (options.format) params.set('format', options.format);
  if (options.quality) params.set('quality', String(options.quality));
  return params.size > 0 ? `${url}?${params}` : url;
}
