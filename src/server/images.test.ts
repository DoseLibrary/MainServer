import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { imageFileName, imageLocalUrl, ImageStore } from './images.ts';

describe('image naming', () => {
  it('strips the leading slash and unsafe characters', () => {
    expect(imageFileName('/abc123.jpg')).toBe('abc123.jpg');
    expect(imageFileName('/../../etc/passwd')).toBe('passwd');
  });

  it('builds a local url or undefined', () => {
    expect(imageLocalUrl('/poster.jpg')).toBe('/api/v1/images/poster.jpg');
    expect(imageLocalUrl(null)).toBeUndefined();
    expect(imageLocalUrl(undefined)).toBeUndefined();
  });
});

describe('ImageStore.cache', () => {
  it('skips fetching when no path is given', async () => {
    const fetcher = vi.fn();
    await new ImageStore('/tmp/does-not-matter', fetcher as unknown as typeof fetch).cache(null);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('generates the sizes screens ask for as artwork lands', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dose-images-'));
    const source = await sharp({ create: { width: 400, height: 600, channels: 3, background: { r: 10, g: 20, b: 30 } } }).jpeg().toBuffer();
    const fetcher = vi.fn(async () => new Response(source, { status: 200 }));
    const store = new ImageStore(directory, fetcher as unknown as typeof fetch);

    await store.cache('/art.jpg', 'poster');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((await readdir(join(directory, '.variants'))).sort()).toEqual(['art-384x576-cover-q82.webp', 'art-600x900-cover-q82.webp']);

    // Artwork already on disk is warmed too, so a library scanned before this
    // existed fills its variants on the next scan instead of on a page view.
    await rm(join(directory, '.variants'), { recursive: true });
    await store.cache('/art.jpg', 'poster');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await readdir(join(directory, '.variants'))).toHaveLength(2);

    await rm(directory, { recursive: true, force: true });
  });
});
