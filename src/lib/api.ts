export interface User {
  id: string;
  username: string;
  role?: 'admin' | 'member';
}

export interface ManagedUser extends Required<User> {
  disabled: boolean;
  createdAt: string;
  updatedAt: string;
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
  children?: CatalogItem[];
}

export interface CatalogGenre { id: string; name: string }
export interface CatalogCollection { id: string; name: string; posterUrl?: string }
export interface CatalogCastMember { name: string; character?: string; profileUrl?: string; order: number }
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
  /** Whether the current user has saved this title to their watch list. */
  inWatchlist?: boolean;
}

export interface CatalogTrailer { site: string; key: string; name: string; type: string; official: boolean; preferred: boolean }

export interface CatalogSection { id: string; title: string; items: CatalogItem[]; layout?: 'poster' | 'card' }
export interface CatalogHome { sections: CatalogSection[]; featured?: CatalogItem }
export interface CatalogSearchItem { id: string; title: string; year?: number; posterUrl?: string; kind: string; meta?: string; badge?: string; genres?: string[] }
export interface CatalogSearch { query: string; groups: Array<{ id: string; label: string; items: CatalogSearchItem[] }> }
export interface ClientCapabilities { containers: string[]; videoCodecs: string[]; audioCodecs: string[]; maxHeight?: number; maxBitrate?: number }
export interface PlaybackResponse {
  plan: { mode: 'direct' | 'transcode'; container: string; remux: boolean; reasons: string[] };
  durationSeconds?: number;
  stream: { url: string; direct: boolean };
}
export interface HealthStatus { status: 'ok' | 'degraded'; database: 'ok' | 'unavailable'; metadata?: { tmdb: 'configured' | 'not_configured' } }
export interface LibraryScan {
  id: string; libraryId: string; status: 'queued' | 'running' | 'completed' | 'failed';
  discoveredFiles?: number; processedFiles?: number; matchedItems?: number; error?: string;
  startedAt?: string; completedAt?: string;
}

export type PluginRunStatus = 'running' | 'succeeded' | 'failed';
export interface PluginField { key: string; label: string; description?: string; secret: boolean; type: 'boolean' | 'number' | 'text' | 'list'; default: unknown }
export interface PluginSummary {
  id: string; name: string; description: string; version: string;
  fields: PluginField[];
  enabled: boolean; schedule: string | null; settings: Record<string, unknown>;
  nextRunAt: string | null; lastRunAt: string | null; lastRunStatus: PluginRunStatus | null;
  lastRunDurationMs: number | null; lastRunSummary: string | null; lastRunError: string | null;
}
export interface PluginRun { id: string; pluginId: string; status: PluginRunStatus; startedAt: string; finishedAt: string | null; durationMs: number | null; summary: string | null; error: string | null }

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
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
    try {
      const body = await response.json() as { message?: string; error?: string };
      message = body.message ?? body.error ?? message;
    } catch {
      // The status remains useful when the server returns an empty/non-JSON error.
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  health: () => request<HealthStatus>('/api/v1/health'),
  setupStatus: () => request<{ setupRequired: boolean }>('/api/v1/setup/status'),
  setup: (credentials: { username: string; password: string }) =>
    request<{ user: User }>('/api/v1/setup', { method: 'POST', body: JSON.stringify(credentials) }),
  login: (credentials: { username: string; password: string }) =>
    request<{ user: User }>('/api/v1/auth/login', { method: 'POST', body: JSON.stringify(credentials) }),
  logout: () => request<void>('/api/v1/auth/logout', { method: 'POST' }),
  me: () => request<{ user: User }>('/api/v1/auth/me'),
  libraries: () => request<{ libraries: Library[] }>('/api/v1/libraries'),
  createLibrary: (library: { name: string; kind: 'movies' | 'shows'; rootPath: string }) =>
    request<{ library: Library }>('/api/v1/libraries', { method: 'POST', body: JSON.stringify(library) }),
  deleteLibrary: (id: string) => request<void>(`/api/v1/libraries/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  catalogHome: (libraryId?: string) => request<CatalogHome>(`/api/v1/catalog/home${libraryId ? `?libraryId=${encodeURIComponent(libraryId)}` : ''}`),
  catalogItem: (id: string) => request<{ item: CatalogItemDetails }>(`/api/v1/catalog/items/${encodeURIComponent(id)}`),
  catalogSearch: (libraryId: string, query: string) => request<CatalogSearch>(`/api/v1/catalog/search?libraryId=${encodeURIComponent(libraryId)}&q=${encodeURIComponent(query)}`),
  playback: (id: string, capabilities: ClientCapabilities) => request<PlaybackResponse>(`/api/v1/catalog/items/${encodeURIComponent(id)}/playback`, { method: 'POST', body: JSON.stringify(capabilities) }),
  saveProgress: (id: string, positionSeconds: number, watched?: boolean) => request<{ mediaItemId: string; positionSeconds: number; watched: boolean }>(`/api/v1/catalog/items/${encodeURIComponent(id)}/progress`, { method: 'POST', body: JSON.stringify({ positionSeconds: Math.round(positionSeconds), ...(watched != null ? { watched } : {}) }) }),
  setWatchlist: (id: string, saved: boolean) => request<{ mediaItemId: string; inWatchlist: boolean }>(`/api/v1/catalog/items/${encodeURIComponent(id)}/watchlist`, { method: saved ? 'POST' : 'DELETE' }),
  startLibraryScan: (id: string) => request<{ scan: LibraryScan }>(`/api/v1/libraries/${encodeURIComponent(id)}/scan`, { method: 'POST' }),
  refreshLibraryMetadata: (id: string, force = false) => request<{ libraryId: string; refreshed: number; failed: number }>(`/api/v1/libraries/${encodeURIComponent(id)}/refresh${force ? '?force=true' : ''}`, { method: 'POST' }),
  latestLibraryScan: (id: string) => request<{ scan: LibraryScan | null }>(`/api/v1/libraries/${encodeURIComponent(id)}/scans/latest`),
  users: () => request<{ users: ManagedUser[] }>('/api/v1/users'),
  createUser: (user: { username: string; password: string; role: 'admin' | 'member' }) =>
    request<{ user: ManagedUser }>('/api/v1/users', { method: 'POST', body: JSON.stringify(user) }),
  updateUser: (id: string, change: { role?: 'admin' | 'member'; disabled?: boolean; password?: string }) =>
    request<{ user: ManagedUser }>(`/api/v1/users/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(change) }),
  deleteUser: (id: string) => request<void>(`/api/v1/users/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  plugins: () => request<{ plugins: PluginSummary[] }>('/api/v1/plugins'),
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
