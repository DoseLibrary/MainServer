import { describe, expect, it, vi } from 'vitest';
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
});
