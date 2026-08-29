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
  FFPROBE_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(3),
  FFPROBE_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(20_000),
  TMDB_API_TOKEN: z.preprocess((value) => value === '' ? undefined : value, z.string().min(1).optional()),
  TMDB_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(4),
  TMDB_REQUESTS_PER_SECOND: z.coerce.number().int().min(1).max(50).default(8),
  TMDB_TIMEOUT_MS: z.coerce.number().int().min(500).max(60_000).default(8_000),
});

type ParsedConfig = z.infer<typeof environmentSchema>;
type TuningKey = 'SCAN_FS_CONCURRENCY' | 'SCAN_INGEST_CONCURRENCY' | 'SCAN_STALE_AFTER_MS' | 'FFPROBE_CONCURRENCY' | 'FFPROBE_TIMEOUT_MS' | 'TMDB_CONCURRENCY' | 'TMDB_REQUESTS_PER_SECOND' | 'TMDB_TIMEOUT_MS';
export type AppConfig = Omit<ParsedConfig, TuningKey> & Partial<Pick<ParsedConfig, TuningKey>>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = environmentSchema.safeParse(environment);

  if (!result.success) {
    throw new Error(`Invalid Dose configuration: ${z.prettifyError(result.error)}`);
  }

  return result.data;
}
