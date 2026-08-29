import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.ts';

describe('loadConfig', () => {
  it('applies local server defaults', () => {
    expect(loadConfig({ DATABASE_URL: 'postgresql://dose:secret@localhost:5432/dose' })).toEqual({
      NODE_ENV: 'development',
      HOST: '0.0.0.0',
      PORT: 3000,
      DATABASE_URL: 'postgresql://dose:secret@localhost:5432/dose',
      CONFIG_PATH: '/config',
      TRANSCODE_PATH: '/transcode',
      SCAN_FS_CONCURRENCY: 24,
      SCAN_INGEST_CONCURRENCY: 8,
      SCAN_STALE_AFTER_MS: 1800000,
      FFPROBE_CONCURRENCY: 3,
      FFPROBE_TIMEOUT_MS: 20000,
      TMDB_CONCURRENCY: 4,
      TMDB_REQUESTS_PER_SECOND: 8,
      TMDB_TIMEOUT_MS: 8000,
    });
  });

  it('rejects missing database configuration', () => {
    expect(() => loadConfig({})).toThrow('Invalid Dose configuration');
  });

  it('accepts an embedded PGlite database for development', () => {
    expect(loadConfig({ DATABASE_URL: 'pglite://.dose/database' }).DATABASE_URL).toBe('pglite://.dose/database');
  });

  it('treats an empty optional TMDB token as unconfigured', () => {
    expect(loadConfig({ DATABASE_URL: 'pglite://.dose/database', TMDB_API_TOKEN: '' }).TMDB_API_TOKEN).toBeUndefined();
  });

  it('rejects invalid ports', () => {
    expect(() => loadConfig({
      DATABASE_URL: 'postgresql://dose:secret@localhost:5432/dose',
      PORT: '70000',
    })).toThrow('Invalid Dose configuration');
  });

  it('rejects unsafe scanner concurrency and lease settings', () => {
    expect(() => loadConfig({ DATABASE_URL: 'postgresql://dose:secret@localhost:5432/dose', SCAN_INGEST_CONCURRENCY: '0' })).toThrow('Invalid Dose configuration');
    expect(() => loadConfig({ DATABASE_URL: 'postgresql://dose:secret@localhost:5432/dose', SCAN_STALE_AFTER_MS: '1000' })).toThrow('Invalid Dose configuration');
  });
});
