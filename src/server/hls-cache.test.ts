import { describe, expect, it, vi } from 'vitest';
import { SegmentCache } from './hls-cache.ts';

const buf = (size: number, fill = 0) => Buffer.alloc(size, fill);

describe('SegmentCache', () => {
  it('serves a fill from cache the second time', async () => {
    const cache = new SegmentCache(1024);
    const encode = vi.fn(async () => buf(10));

    await cache.fill('a', encode);
    await cache.fill('a', encode);

    expect(encode).toHaveBeenCalledTimes(1);
    expect(cache.get('a')).toHaveLength(10);
  });

  it('coalesces concurrent fills for the same key into one encode', async () => {
    const cache = new SegmentCache(1024);
    let release!: (body: Buffer) => void;
    const encode = vi.fn(() => new Promise<Buffer>((resolve) => { release = resolve; }));

    const first = cache.fill('a', encode);
    const second = cache.fill('a', encode);
    expect(cache.knows('a')).toBe(true);
    release(buf(5));

    expect(await first).toBe(await second);
    expect(encode).toHaveBeenCalledTimes(1);
  });

  it('evicts least recently used entries once over budget', async () => {
    const cache = new SegmentCache(30);
    await cache.fill('a', async () => buf(10, 1));
    await cache.fill('b', async () => buf(10, 2));
    await cache.fill('c', async () => buf(10, 3));

    cache.get('a'); // refresh: b is now the oldest
    await cache.fill('d', async () => buf(10, 4));

    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBeDefined();
    expect(cache.get('c')).toBeDefined();
    expect(cache.get('d')).toBeDefined();
    expect(cache.sizeBytes).toBe(30);
  });

  it('never stores a body larger than the whole budget', async () => {
    const cache = new SegmentCache(10);
    await cache.fill('a', async () => buf(11));
    expect(cache.get('a')).toBeUndefined();
    expect(cache.sizeBytes).toBe(0);
  });

  it('drops the inflight marker when an encode fails, so a retry re-encodes', async () => {
    const cache = new SegmentCache(1024);
    const failing = vi.fn(async () => { throw new Error('boom'); });

    await expect(cache.fill('a', failing)).rejects.toThrow('boom');
    expect(cache.knows('a')).toBe(false);
    await cache.fill('a', async () => buf(5));
    expect(cache.get('a')).toHaveLength(5);
  });
});
