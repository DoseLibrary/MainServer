import { afterEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
const end = vi.fn();

vi.mock('./db/client.ts', () => ({
  createDatabase: () => ({ database: {}, health: query, close: end }),
}));

const { buildApp, staticCacheControl } = await import('./app.ts');

describe('static cache headers', () => {
  it('marks hashed Vite assets immutable', () => {
    expect(staticCacheControl('C:\\app\\dist\\assets\\index-DWdGF21Z.js')).toBe('public, max-age=31536000, immutable');
    expect(staticCacheControl('/app/dist/assets/index-B7uVzHFQ.css')).toBe('public, max-age=31536000, immutable');
  });

  it('keeps the shell files revalidating', () => {
    for (const file of ['/app/dist/index.html', '/app/dist/sw.js', '/app/dist/manifest.webmanifest', 'C:\\app\\dist\\logo.svg']) {
      expect(staticCacheControl(file)).toBe('public, max-age=0, must-revalidate');
    }
  });
});

const config = {
  NODE_ENV: 'test' as const,
  HOST: '127.0.0.1',
  PORT: 3000,
  DATABASE_URL: 'postgresql://dose:secret@localhost:5432/dose',
  CONFIG_PATH: '/config',
  TRANSCODE_PATH: '/transcode',
  YT_DLP_PATH: 'yt-dlp',
};

afterEach(() => {
  query.mockReset();
  end.mockReset();
});

describe('Dose API', () => {
  it('reports a healthy database', async () => {
    query.mockResolvedValueOnce([{ '?column?': 1 }]);
    const app = await buildApp(config);

    const response = await app.inject({ method: 'GET', url: '/api/v1/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', database: 'ok', metadata: { tmdb: 'not_configured' } });
    await app.close();
    expect(end).toHaveBeenCalledOnce();
  });

  it('reports database failures without exposing internals', async () => {
    query.mockRejectedValueOnce(new Error('connection refused'));
    const app = await buildApp(config);

    const response = await app.inject({ method: 'GET', url: '/api/v1/health' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'degraded', database: 'unavailable', metadata: { tmdb: 'not_configured' } });
    await app.close();
  });
});
