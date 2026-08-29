import { eq } from 'drizzle-orm';
import { join } from 'node:path';
import { z } from 'zod';
import type { Database } from '../db/client.ts';
import { libraries, mediaFiles, mediaSubtitles } from '../db/schema.ts';
import { isTextSubtitle, type SubtitleStore, type SubtitleTools } from '../subtitles.ts';
import type { PluginDefinition } from './types.ts';

const settingsSchema = z.object({
  languages: z.array(z.string().min(2).max(10)).default([]),
  includeForced: z.boolean().default(true),
});

function label(stream: { title?: string; language?: string; index: number }): string {
  return stream.title?.trim() || stream.language?.toUpperCase() || `Subtitle ${stream.index}`;
}

export function createSubtitleExtractorPlugin(database: Database, tools: SubtitleTools, store: SubtitleStore): PluginDefinition<z.infer<typeof settingsSchema>> {
  return {
    id: 'subtitle-extractor',
    metadata: { name: 'Subtitle Extractor', description: 'Extracts embedded text subtitles to WebVTT for in-player captions.', version: '1.0.0' },
    settingsSchema,
    settings: { languages: { label: 'Languages (blank = all)' }, includeForced: { label: 'Include forced subtitles' } },
    async run({ settings, signal }) {
      const files = await database.select({ id: mediaFiles.id, relativePath: mediaFiles.relativePath, rootPath: libraries.rootPath })
        .from(mediaFiles).innerJoin(libraries, eq(libraries.id, mediaFiles.libraryId))
        .where(eq(mediaFiles.available, true));
      const wanted = new Set(settings.languages.map((language) => language.toLowerCase()));
      await store.ensureDir();
      let scanned = 0; let extracted = 0; let failed = 0;
      for (const file of files) {
        if (signal.aborted) throw signal.reason ?? new Error('Subtitle extraction cancelled');
        const absolute = join(file.rootPath, file.relativePath);
        try {
          const streams = (await tools.probe(absolute)).filter((stream) => isTextSubtitle(stream.codec)
            && (settings.includeForced || !stream.forced)
            && (wanted.size === 0 || (stream.language != null && wanted.has(stream.language.toLowerCase()))));
          for (const stream of streams) {
            const key = `${file.id}.${stream.index}.vtt`;
            await tools.extract(absolute, stream.index, store.pathFor(key));
            await database.insert(mediaSubtitles)
              .values({ mediaFileId: file.id, streamIndex: stream.index, language: stream.language, label: label(stream), forced: stream.forced, storageKey: key, source: 'embedded' })
              .onConflictDoUpdate({ target: [mediaSubtitles.mediaFileId, mediaSubtitles.streamIndex], set: { language: stream.language, label: label(stream), forced: stream.forced, storageKey: key, updatedAt: new Date() } });
            extracted++;
          }
          scanned++;
        } catch { failed++; }
      }
      return { summary: `Scanned ${scanned} files, extracted ${extracted} subtitles${failed ? `, ${failed} failed` : ''}` };
    },
  };
}
