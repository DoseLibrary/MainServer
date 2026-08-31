import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

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

/** Real ffmpeg-backed sprite generation; injected into the plugin so it stays testable. */
export function ffmpegSpriteTools(timeoutMs = 120_000): SpriteTools {
  return {
    async generate(absolutePath, layout, outputPath) {
      // Sample one frame per interval, cover-fit each into the tile, then pack the
      // first columns*rows frames into a single sheet (padding a short last row).
      const filter = [
        `fps=1/${layout.interval}`,
        `scale=${layout.tileWidth}:${layout.tileHeight}:force_original_aspect_ratio=increase`,
        `crop=${layout.tileWidth}:${layout.tileHeight}`,
        `tile=${layout.columns}x${layout.rows}:padding=0`,
      ].join(',');
      await execFileAsync('ffmpeg', ['-y', '-i', absolutePath, '-frames:v', '1', '-vf', filter, '-q:v', '4', outputPath], { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 });
    },
  };
}
