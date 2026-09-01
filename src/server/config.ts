import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DATABASE_URL: z.string().refine((value) => value.startsWith('postgresql://') || value.startsWith('pglite://'), 'Expected a postgresql:// or pglite:// database URL'),
  CONFIG_PATH: z.string().min(1).default('/config'),
  TRANSCODE_PATH: z.string().min(1).default('/transcode'),
  SCAN_FS_CONCURRENCY: z.coerce.number().int().min(1).max(128).default(24),
  SCAN_INGEST_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(8),
  SCAN_STALE_AFTER_MS: z.coerce.number().int().min(60_000).max(86_400_000).default(1_800_000),
  LIBRARY_WATCH_ENABLED: z.stringbool().default(true),
  LIBRARY_WATCH_DEBOUNCE_MS: z.coerce.number().int().min(50).max(60_000).default(1_000),
  // Probing reads container headers, not whole files; a modern box and an
  // array both handle more than three at once.
  FFPROBE_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(6),
  FFPROBE_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(20_000),
  TMDB_API_TOKEN: z.preprocess((value) => value === '' ? undefined : value, z.string().min(1).optional()),
  TMDB_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(4),
  /** Artwork downloads run against the image CDN, which has no API rate limit. */
  TMDB_IMAGE_CONCURRENCY: z.coerce.number().int().min(1).max(32).default(12),
  TMDB_REQUESTS_PER_SECOND: z.coerce.number().int().min(1).max(50).default(8),
  TMDB_TIMEOUT_MS: z.coerce.number().int().min(500).max(60_000).default(8_000),
  YT_DLP_PATH: z.string().min(1).default('yt-dlp'),
});

type ParsedConfig = z.infer<typeof environmentSchema>;
type TuningKey = 'SCAN_FS_CONCURRENCY' | 'SCAN_INGEST_CONCURRENCY' | 'SCAN_STALE_AFTER_MS' | 'LIBRARY_WATCH_ENABLED' | 'LIBRARY_WATCH_DEBOUNCE_MS' | 'FFPROBE_CONCURRENCY' | 'FFPROBE_TIMEOUT_MS' | 'TMDB_CONCURRENCY' | 'TMDB_IMAGE_CONCURRENCY' | 'TMDB_REQUESTS_PER_SECOND' | 'TMDB_TIMEOUT_MS';
export type AppConfig = Omit<ParsedConfig, TuningKey> & Partial<Pick<ParsedConfig, TuningKey>>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = environmentSchema.safeParse(environment);

  if (!result.success) {
    throw new Error(`Invalid Dose configuration: ${z.prettifyError(result.error)}`);
  }

  return result.data;
}
