/**
 * Seerr integration: ask a request manager for the titles this library is
 * missing.
 *
 * Dose already knows which parts of a collection it does not have — the gaps
 * come from TMDB during enrichment. Seerr (and its Overseerr/Jellyseerr
 * predecessors, whose API it keeps) is what a household usually already runs to
 * turn "I want that one" into a download. This client speaks just enough of
 * that API to show request state and create a request.
 */

/** Availability of a title inside Seerr, from its MediaStatus enum. */
export type SeerrMediaState = 'unknown' | 'pending' | 'processing' | 'partial' | 'available' | 'deleted';

const MEDIA_STATES: Record<number, SeerrMediaState> = {
  1: 'unknown', 2: 'pending', 3: 'processing', 4: 'partial', 5: 'available', 6: 'deleted',
};

/** States that mean "someone already asked for this", so we must not offer it again. */
export const REQUESTED_STATES: readonly SeerrMediaState[] = ['pending', 'processing', 'partial', 'available'];

export interface SeerrConfig {
  baseUrl: string;
  apiKey: string;
}

export class SeerrError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'SeerrError';
  }
}

export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

/** `https://seerr.local:5055/` and `https://seerr.local:5055` both mean the same thing. */
export function apiBase(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(trimmed)) throw new SeerrError('Seerr address must start with http:// or https://');
  return `${trimmed.replace(/\/api\/v1$/i, '')}/api/v1`;
}

interface SeerrRequestRow {
  media?: { tmdbId?: number; status?: number };
}

export class SeerrClient {
  constructor(
    private readonly config: SeerrConfig,
    private readonly fetcher: Fetcher = fetch,
    private readonly timeoutMs = 8_000,
  ) {}

  private async call<T>(path: string, init?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetcher(`${apiBase(this.config.baseUrl)}${path}`, {
        ...init,
        signal: controller.signal,
        headers: { 'X-Api-Key': this.config.apiKey, 'Content-Type': 'application/json', ...init?.headers },
      });
    } catch (cause) {
      // A wrong address and a stopped container look the same from here; say so
      // rather than leaking an AbortError to the admin reading the message.
      throw new SeerrError(controller.signal.aborted ? 'Seerr did not respond in time' : `Could not reach Seerr: ${cause instanceof Error ? cause.message : String(cause)}`);
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 401 || response.status === 403) throw new SeerrError('Seerr rejected the API key', response.status);
    if (!response.ok) throw new SeerrError(`Seerr returned ${response.status}`, response.status);
    if (response.status === 204) return undefined as T;
    try { return await response.json() as T; }
    catch { throw new SeerrError('Seerr returned a response that was not JSON'); }
  }

  /** Connectivity and credentials check; returns the version for display. */
  async serverStatus(): Promise<{ version: string }> {
    const body = await this.call<{ version?: string }>('/status');
    return { version: typeof body?.version === 'string' ? body.version : 'unknown' };
  }

  /**
   * Every TMDB id Seerr already knows about, mapped to its availability.
   *
   * One call covers a whole page of gaps. Seerr has no way to ask about a list
   * of ids, and asking per title would mean a request per poster.
   */
  async requestedMedia(limit = 500): Promise<Map<number, SeerrMediaState>> {
    const body = await this.call<{ results?: SeerrRequestRow[] }>(`/request?take=${limit}&skip=0&filter=all&sort=added`);
    const states = new Map<number, SeerrMediaState>();
    for (const row of body?.results ?? []) {
      const tmdbId = row?.media?.tmdbId;
      const status = row?.media?.status;
      if (typeof tmdbId !== 'number' || !Number.isInteger(tmdbId)) continue;
      states.set(tmdbId, MEDIA_STATES[status ?? 1] ?? 'unknown');
    }
    return states;
  }

  /** Ask Seerr for a title. Approval and downloading are Seerr's business. */
  async requestMedia(input: { mediaType: 'movie' | 'tv'; tmdbId: number; is4k?: boolean; seasons?: number[] }): Promise<{ state: SeerrMediaState }> {
    const body = await this.call<{ media?: { status?: number } }>('/request', {
      method: 'POST',
      body: JSON.stringify({
        mediaType: input.mediaType,
        mediaId: input.tmdbId,
        ...(input.is4k ? { is4k: true } : {}),
        ...(input.mediaType === 'tv' ? { seasons: input.seasons ?? 'all' } : {}),
      }),
    });
    return { state: MEDIA_STATES[body?.media?.status ?? 2] ?? 'pending' };
  }
}

/**
 * The request states, cached briefly.
 *
 * Opening a collection page asks for them, and several people opening several
 * pages should not become several calls a second to a box that is usually
 * running Radarr behind it.
 */
export class SeerrStateCache {
  private states: Map<number, SeerrMediaState> = new Map();
  /** Null means never loaded, which is not the same as loaded long ago. */
  private fetchedAt: number | null = null;
  private inflight: Promise<Map<number, SeerrMediaState>> | null = null;

  constructor(private readonly ttlMs = 30_000, private readonly now = () => Date.now()) {}

  async get(client: SeerrClient): Promise<Map<number, SeerrMediaState>> {
    if (this.fetchedAt != null && this.now() - this.fetchedAt < this.ttlMs) return this.states;
    this.inflight ??= client.requestedMedia()
      .then((states) => { this.states = states; this.fetchedAt = this.now(); return states; })
      .finally(() => { this.inflight = null; });
    return this.inflight;
  }

  /** A new request changes the answer, so the next read must not be stale. */
  invalidate() { this.fetchedAt = null; }
}
