/**
 * A small stale-while-revalidate cache for read-only API calls.
 *
 * Navigating back to a page you just left should be instant, not another
 * spinner: the cached value renders immediately and a background refresh
 * corrects it. Entries are per-session and in memory only — nothing here
 * outlives a reload, so it can never serve another account's data.
 */

type Entry<T> = { value?: T; at: number; inflight?: Promise<T> };

const entries = new Map<string, Entry<unknown>>();

/** How long a cached value is served without a background refresh. */
const FRESH_MS = 30_000;
/** Beyond this a value is too old to show at all. */
const STALE_MS = 5 * 60_000;

export function cachedValue<T>(key: string): T | undefined {
  const entry = entries.get(key) as Entry<T> | undefined;
  if (!entry?.value || Date.now() - entry.at > STALE_MS) return undefined;
  return entry.value;
}

/**
 * Read through the cache. `onFresh` fires when a background refresh produces a
 * value different from the one already returned, so callers can render the
 * cached copy immediately and update in place.
 */
export async function cached<T>(key: string, fetcher: () => Promise<T>, onFresh?: (value: T) => void): Promise<T> {
  const entry = entries.get(key) as Entry<T> | undefined;
  const age = entry ? Date.now() - entry.at : Infinity;

  if (entry?.value && age <= FRESH_MS) return entry.value;

  if (entry?.value && age <= STALE_MS) {
    // Serve the stale copy now; correct it when the network answers.
    if (!entry.inflight) {
      entry.inflight = fetcher()
        .then((value) => { entries.set(key, { value, at: Date.now() }); onFresh?.(value); return value; })
        .catch((error) => { entry.inflight = undefined; throw error; });
      void entry.inflight.catch(() => { /* the stale value stays usable */ });
    }
    return entry.value;
  }

  if (entry?.inflight) return entry.inflight;

  const inflight = fetcher().then((value) => { entries.set(key, { value, at: Date.now() }); return value; });
  entries.set(key, { at: Date.now(), inflight } as Entry<unknown>);
  try { return await inflight; }
  catch (error) { entries.delete(key); throw error; }
}

/** Warm a key without caring about the result — used on hover and focus. */
export function prefetch<T>(key: string, fetcher: () => Promise<T>): void {
  const entry = entries.get(key) as Entry<T> | undefined;
  if (entry?.inflight || (entry?.value && Date.now() - entry.at <= FRESH_MS)) return;
  void cached(key, fetcher).catch(() => { /* a warm-up failure is not an error */ });
}

/** Replace a cached value in place, for callers that already have fresh data. */
export function primeCache<T>(key: string, value: T): void {
  entries.set(key, { value, at: Date.now() });
}

/** Drop everything, e.g. on sign-out so a different account starts clean. */
export function clearCache(): void {
  entries.clear();
}

/** Cache keys, so producers and prefetchers cannot drift apart. */
export const cacheKeys = {
  catalogHome: (libraryId?: string) => `catalog:home:${libraryId ?? 'all'}`,
  catalogItem: (id: string) => `catalog:item:${id}`,
};
