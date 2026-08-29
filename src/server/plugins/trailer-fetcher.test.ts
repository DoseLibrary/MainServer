import { describe, expect, it } from 'vitest';
import { choosePreferred } from './trailer-fetcher.ts';
import type { TmdbVideo } from '../tmdb.ts';

describe('trailer fetcher', () => {
  it('deterministically prefers official YouTube trailers in preferred language', () => {
    const videos: TmdbVideo[] = [
      { id: 'b', key: 'b', site: 'YouTube', name: 'Trailer', type: 'Trailer', official: true, language: 'sv' },
      { id: 'a', key: 'a', site: 'YouTube', name: 'Trailer', type: 'Trailer', official: true, language: 'en' },
      { id: 'c', key: 'c', site: 'YouTube', name: 'Trailer', type: 'Trailer', official: false, language: 'en' },
    ];
    expect(choosePreferred(videos, ['en', 'sv'])?.id).toBe('a');
  });
});
