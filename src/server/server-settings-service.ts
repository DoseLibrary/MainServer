import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from './db/client.ts';
import { serverSettings } from './db/schema.ts';

/** x264 speed presets, slowest last. Hardware families map these onto their own scales. */
export const ENCODER_PRESETS = ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow'] as const;
export type EncoderPreset = (typeof ENCODER_PRESETS)[number];

export const transcodingSettingsSchema = z.object({
  preset: z.enum(ENCODER_PRESETS),
  /** CRF for the source-quality rung; lower rungs sit a little above it. */
  quality: z.number().int().min(14).max(30),
  /** ffmpeg `-threads`; zero leaves the choice to ffmpeg. */
  threads: z.number().int().min(0).max(64),
  /** Re-encode to HEVC when the client can decode it: smaller streams, slower encodes. */
  preferHevcOutput: z.boolean(),
});
export type TranscodingSettings = z.infer<typeof transcodingSettingsSchema>;
export const transcodingSettingsPatch = transcodingSettingsSchema.partial().strip();
export type TranscodingSettingsPatch = z.infer<typeof transcodingSettingsPatch>;

export const DEFAULT_TRANSCODING_SETTINGS: TranscodingSettings = { preset: 'veryfast', quality: 21, threads: 0, preferHevcOutput: false };

const TRANSCODING_KEY = 'transcoding';

/**
 * Operator settings, one JSON document per key. Every playback request reads
 * the transcoding document, so it is held in memory after the first load and
 * written through on change.
 */
export class ServerSettingsService {
  private transcodingCache: TranscodingSettings | undefined;

  constructor(readonly database: Database) {}

  async transcoding(): Promise<TranscodingSettings> {
    if (this.transcodingCache) return this.transcodingCache;
    const [row] = await this.database.select({ value: serverSettings.value }).from(serverSettings).where(eq(serverSettings.key, TRANSCODING_KEY)).limit(1);
    // A document written by an older build may lack a field or hold a value
    // that is no longer allowed; the defaults fill in rather than failing playback.
    const parsed = transcodingSettingsPatch.safeParse(row?.value ?? {});
    this.transcodingCache = { ...DEFAULT_TRANSCODING_SETTINGS, ...(parsed.success ? parsed.data : {}) };
    return this.transcodingCache;
  }

  async updateTranscoding(patch: TranscodingSettingsPatch): Promise<TranscodingSettings> {
    const change = transcodingSettingsPatch.parse(patch);
    const next = { ...(await this.transcoding()), ...change };
    await this.database.insert(serverSettings).values({ key: TRANSCODING_KEY, value: next, updatedAt: new Date() })
      .onConflictDoUpdate({ target: serverSettings.key, set: { value: next, updatedAt: new Date() } });
    this.transcodingCache = next;
    return next;
  }
}
