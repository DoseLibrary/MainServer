import { describe, expect, it } from 'vitest';
import { injectHead, openGraphTags, sharePathItemId } from './open-graph.ts';

const ID = '20000000-0000-4000-8000-000000000001';

describe('sharePathItemId', () => {
  it('recognises a media details URL and nothing else', () => {
    expect(sharePathItemId(`/media/${ID}`)).toBe(ID);
    expect(sharePathItemId(`/media/${ID}?tab=cast`)).toBe(ID);
    expect(sharePathItemId(`/media/${ID}/`)).toBe(ID);
    expect(sharePathItemId('/media/not-a-uuid')).toBeNull();
    expect(sharePathItemId(`/watch/${ID}`)).toBeNull();
    expect(sharePathItemId('/')).toBeNull();
  });
});

describe('openGraphTags', () => {
  it('describes a title with an absolute image and escapes markup', () => {
    const tags = openGraphTags({ title: 'Heat <1995>', overview: 'A "thief" & a cop.', imageUrl: '/api/v1/images/b.jpg', kind: 'movie', year: 1995 }, 'https://dose.local', `/media/${ID}`);
    expect(tags).toContain('<meta property="og:title" content="Heat &lt;1995&gt; (1995)">');
    expect(tags).toContain('<meta property="og:description" content="A &quot;thief&quot; &amp; a cop.">');
    expect(tags).toContain('<meta property="og:image" content="https://dose.local/api/v1/images/b.jpg?w=1200&amp;h=630&amp;fit=cover&amp;format=jpeg">');
    expect(tags).toContain(`<meta property="og:url" content="https://dose.local/media/${ID}">`);
    expect(tags).toContain('<meta property="og:type" content="video.movie">');
    expect(tags).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(tags).toContain('<meta property="og:site_name" content="Dose">');
  });

  it('falls back to a summary card and no image line when there is no artwork', () => {
    const tags = openGraphTags({ title: 'Lost', kind: 'series' }, 'https://dose.local', `/media/${ID}`);
    expect(tags).not.toContain('og:image');
    expect(tags).toContain('<meta name="twitter:card" content="summary">');
    expect(tags).toContain('<meta property="og:type" content="video.tv_show">');
    expect(tags).toContain('<meta property="og:title" content="Lost">');
  });
});

describe('injectHead', () => {
  it('places the tags before </head> and swaps the document title', () => {
    const html = '<!doctype html><html><head><meta charset="UTF-8"><title>DOSE</title></head><body></body></html>';
    const out = injectHead(html, '<meta property="og:title" content="Heat">', 'Heat');
    expect(out).toBe('<!doctype html><html><head><meta charset="UTF-8"><title>Heat · DOSE</title><meta property="og:title" content="Heat"></head><body></body></html>');
  });

  it('returns the page untouched when there is no head to extend', () => {
    expect(injectHead('<div>no head</div>', '<meta>', 'x')).toBe('<div>no head</div>');
  });
});
