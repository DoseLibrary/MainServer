import { afterEach, describe, expect, it, vi } from 'vitest';
import { cached, cachedValue, cacheKeys, clearCache, prefetch, primeCache } from './cache.ts';

afterEach(() => { clearCache(); vi.useRealTimers(); });

describe('the read-through cache', () => {
  it('fetches once for concurrent readers of the same key', async () => {
    const fetcher = vi.fn(async () => 'value');

    const [first, second] = await Promise.all([cached('k', fetcher), cached('k', fetcher)]);

    expect(first).toBe('value');
    expect(second).toBe('value');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('serves a fresh value without touching the network again', async () => {
    const fetcher = vi.fn(async () => 'value');
    await cached('k', fetcher);

    expect(await cached('k', fetcher)).toBe('value');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('serves a stale value immediately and corrects it behind the render', async () => {
    vi.useFakeTimers();
    let answer = 'old';
    const fetcher = vi.fn(async () => answer);
    await cached('k', fetcher);

    // Past the freshness window, still inside the usable one.
    vi.advanceTimersByTime(60_000);
    answer = 'new';
    const onFresh = vi.fn();
    expect(await cached('k', fetcher, onFresh)).toBe('old');

    await vi.waitFor(() => expect(onFresh).toHaveBeenCalledWith('new'));
    expect(await cached('k', fetcher)).toBe('new');
  });

  it('refetches once a value is too old to show', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async () => 'value');
    await cached('k', fetcher);

    vi.advanceTimersByTime(10 * 60_000);
    expect(cachedValue('k')).toBeUndefined();
    await cached('k', fetcher);

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('does not cache a failure', async () => {
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce('value');

    await expect(cached('k', fetcher)).rejects.toThrow('offline');
    expect(cachedValue('k')).toBeUndefined();
    expect(await cached('k', fetcher)).toBe('value');
  });

  it('prefetches only what is missing, and never throws at the caller', async () => {
    const fetcher = vi.fn(async () => 'value');
    prefetch('k', fetcher);
    await vi.waitFor(() => expect(cachedValue('k')).toBe('value'));

    prefetch('k', fetcher); // already warm
    expect(fetcher).toHaveBeenCalledTimes(1);

    expect(() => prefetch('broken', async () => { throw new Error('nope'); })).not.toThrow();
  });

  it('forgets everything on demand, so a new account starts clean', async () => {
    primeCache(cacheKeys.catalogItem('m1'), { title: 'Arrival' });
    expect(cachedValue(cacheKeys.catalogItem('m1'))).toEqual({ title: 'Arrival' });

    clearCache();

    expect(cachedValue(cacheKeys.catalogItem('m1'))).toBeUndefined();
  });
});
