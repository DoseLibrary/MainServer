import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp, { type OverlayOptions } from 'sharp';
import { Semaphore } from './concurrency.ts';

const execFileAsync = promisify(execFile);
const KEY = /^[A-Za-z0-9._-]+$/;

export interface SpriteLayout {
  interval: number;
  columns: number;
  rows: number;
  tileWidth: number;
  tileHeight: number;
}

export interface SpriteTools {
  /** Render a single storyboard sprite sheet for a video into outputPath. */
  generate(absolutePath: string, layout: SpriteLayout, outputPath: string): Promise<void>;
}

/** Manages the on-disk storyboard sprite sheets produced by the preview plugin. */
export class PreviewSpriteStore {
  constructor(private readonly dir: string) {}
  pathFor(key: string): string {
    if (!KEY.test(key)) throw new Error('Invalid sprite key');
    return join(this.dir, key);
  }
  async ensureDir(): Promise<void> { await mkdir(this.dir, { recursive: true }); }
  async read(key: string): Promise<Buffer> { return readFile(this.pathFor(key)); }
}

/** Concurrent seeks per sheet. Seeking is I/O-and-seek bound, not CPU bound. */
const TILE_CONCURRENCY = 4;

/**
 * Real ffmpeg-backed sprite generation; injected into the plugin so it stays
 * testable.
 *
 * Each tile is grabbed with an input seek (`-ss` before `-i`) that jumps to the
 * nearest keyframe and decodes one frame, instead of decoding the entire video
 * and keeping one frame in 250. On a large library that is the difference
 * between days and weeks; the tradeoff is keyframe-accurate rather than
 * frame-accurate sampling, which a hover scrubber cannot tell apart.
 */
export function ffmpegSpriteTools(timeoutMs = 15_000): SpriteTools {
  const seeks = new Semaphore(TILE_CONCURRENCY);

  async function grabTile(absolutePath: string, atSeconds: number, layout: SpriteLayout): Promise<Buffer | null> {
    try {
      const { stdout } = await seeks.run(() => execFileAsync('ffmpeg', [
        '-v', 'error', '-ss', String(atSeconds), '-i', absolutePath, '-frames:v', '1',
        '-vf', `scale=${layout.tileWidth}:${layout.tileHeight}:force_original_aspect_ratio=increase,crop=${layout.tileWidth}:${layout.tileHeight}`,
        '-f', 'image2pipe', '-c:v', 'mjpeg', '-q:v', '4', 'pipe:1',
      ], { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024, encoding: 'buffer' as never })) as unknown as { stdout: Buffer };
      return stdout.length > 0 ? stdout : null;
    } catch {
      // A seek past the end, or a broken GOP, costs one tile, not the sheet.
      return null;
    }
  }

  return {
    async generate(absolutePath, layout, outputPath) {
      const count = layout.columns * layout.rows;
      const tiles = await Promise.all(Array.from({ length: count }, (_, index) =>
        grabTile(absolutePath, index * layout.interval, layout)));
      if (!tiles.some(Boolean)) throw new Error('No frames could be decoded for the sprite sheet');

      // Missing tiles (seeks past the end) repeat the last good frame so the
      // sheet geometry the player relies on stays exact.
      let lastGood: Buffer | null = null;
      const composites: OverlayOptions[] = [];
      for (const [index, tile] of tiles.entries()) {
        const buffer = tile ?? lastGood;
        if (tile) lastGood = tile;
        if (!buffer) continue;
        composites.push({
          input: buffer,
          left: (index % layout.columns) * layout.tileWidth,
          top: Math.floor(index / layout.columns) * layout.tileHeight,
        });
      }
      await sharp({
        create: {
          width: layout.columns * layout.tileWidth,
          height: layout.rows * layout.tileHeight,
          channels: 3,
          background: { r: 0, g: 0, b: 0 },
        },
      }).composite(composites).jpeg({ quality: 72 }).toFile(outputPath);
    },
  };
}
