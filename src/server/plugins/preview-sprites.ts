import { eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { z } from 'zod';
import type { Database } from '../db/client.ts';
import { libraries, mediaFiles, mediaPreviewSprites } from '../db/schema.ts';
import type { PreviewSpriteStore, SpriteTools } from '../sprites.ts';
import type { PluginDefinition } from './types.ts';

export const previewSpriteSettingsSchema = z.object({
  interval: z.number().int().min(1).max(120).default(10),
  columns: z.number().int().min(1).max(20).default(10),
  tileWidth: z.number().int().min(40).max(640).default(160),
  tileHeight: z.number().int().min(24).max(360).default(90),
  /** Cap on total tiles so a long film cannot produce an enormous sheet. */
  maxTiles: z.number().int().min(1).max(600).default(200),
});

type PreviewSpriteSettings = z.infer<typeof previewSpriteSettingsSchema>;

function signatureOf(durationSeconds: number, modifiedAt: Date, settings: PreviewSpriteSettings, rows: number): string {
  return createHash('sha256')
    .update(`${durationSeconds}:${modifiedAt.getTime()}:${settings.interval}:${settings.columns}:${rows}:${settings.tileWidth}:${settings.tileHeight}`)
    .digest('hex')
    .slice(0, 32);
}

export function createPreviewSpritePlugin(database: Database, tools: SpriteTools, store: PreviewSpriteStore): PluginDefinition<PreviewSpriteSettings> {
  return {
    id: 'preview-sprites',
    metadata: { name: 'Scrubber Previews', description: 'Generates storyboard sprite sheets for scrubber hover previews.', version: '1.0.0' },
    settingsSchema: previewSpriteSettingsSchema,
    settings: {
      interval: { label: 'Seconds per frame' },
      columns: { label: 'Columns per sheet' },
      tileWidth: { label: 'Tile width (px)' },
      tileHeight: { label: 'Tile height (px)' },
      maxTiles: { label: 'Maximum tiles per title' },
    },
    async run({ settings, signal }) {
      const parsed = previewSpriteSettingsSchema.parse(settings);
      const files = await database.select({ id: mediaFiles.id, relativePath: mediaFiles.relativePath, durationSeconds: mediaFiles.durationSeconds, modifiedAt: mediaFiles.modifiedAt, rootPath: libraries.rootPath })
        .from(mediaFiles).innerJoin(libraries, eq(libraries.id, mediaFiles.libraryId))
        .where(eq(mediaFiles.available, true));
      await store.ensureDir();
      let scanned = 0; let generated = 0; let current = 0; let skipped = 0; let failed = 0;
      for (const file of files) {
        if (signal.aborted) throw signal.reason ?? new Error('Preview sprite generation cancelled');
        if (!file.durationSeconds || file.durationSeconds < parsed.interval) { skipped++; continue; }
        scanned++;
        const tileCount = Math.min(parsed.maxTiles, Math.max(1, Math.floor(file.durationSeconds / parsed.interval)));
        const rows = Math.ceil(tileCount / parsed.columns);
        const signature = signatureOf(file.durationSeconds, file.modifiedAt, parsed, rows);
        const [existing] = await database.select({ signature: mediaPreviewSprites.signature }).from(mediaPreviewSprites).where(eq(mediaPreviewSprites.mediaFileId, file.id)).limit(1);
        if (existing?.signature === signature) { current++; continue; }
        const key = `${file.id}.jpg`;
        try {
          await tools.generate(join(file.rootPath, file.relativePath), { interval: parsed.interval, columns: parsed.columns, rows, tileWidth: parsed.tileWidth, tileHeight: parsed.tileHeight }, store.pathFor(key));
          if (signal.aborted) throw signal.reason ?? new Error('Preview sprite generation cancelled');
          await database.insert(mediaPreviewSprites)
            .values({ mediaFileId: file.id, storageKey: key, columns: parsed.columns, rows, interval: parsed.interval, tileWidth: parsed.tileWidth, tileHeight: parsed.tileHeight, signature })
            .onConflictDoUpdate({ target: [mediaPreviewSprites.mediaFileId], set: { storageKey: key, columns: parsed.columns, rows, interval: parsed.interval, tileWidth: parsed.tileWidth, tileHeight: parsed.tileHeight, signature, updatedAt: new Date() } });
          generated++;
        } catch (error) {
          if (signal.aborted) throw error;
          failed++;
        }
      }
      return { summary: `Scanned ${scanned} files, generated ${generated} sprite sheets, ${current} current, skipped ${skipped}${failed ? `, ${failed} failed (ffmpeg unavailable?)` : ''}` };
    },
  };
}
