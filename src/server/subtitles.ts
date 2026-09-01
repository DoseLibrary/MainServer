import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);
const KEY = /^[A-Za-z0-9._-]+$/;
/** Text-based subtitle codecs that ffmpeg can convert to WebVTT (image subs like PGS cannot). */
const TEXT_CODECS = new Set(['subrip', 'srt', 'ass', 'ssa', 'mov_text', 'webvtt', 'text']);

export function isTextSubtitle(codec: string): boolean {
  return TEXT_CODECS.has(codec.toLowerCase());
}

export interface SubtitleStream {
  index: number;
  codec: string;
  language?: string;
  title?: string;
  forced: boolean;
}

export interface SubtitleTools {
  probe(absolutePath: string): Promise<SubtitleStream[]>;
  extract(absolutePath: string, streamIndex: number, outputPath: string): Promise<void>;
  /** Extract several streams in one pass over the file; demuxing reads the
   * whole container, so per-stream passes multiply the I/O by the track count. */
  extractAll(absolutePath: string, targets: Array<{ streamIndex: number; outputPath: string }>): Promise<void>;
}

/** Manages the on-disk WebVTT sidecar files produced by subtitle extraction. */
export class SubtitleStore {
  constructor(private readonly dir: string) {}
  private async ensure() { await mkdir(this.dir, { recursive: true }); }
  pathFor(key: string): string {
    if (!KEY.test(key)) throw new Error('Invalid subtitle key');
    return join(this.dir, key);
  }
  async ensureDir(): Promise<void> { await this.ensure(); }
  async read(key: string): Promise<Buffer> { return readFile(this.pathFor(key)); }
  /** Write a WebVTT file, creating the store directory if it is missing. */
  async write(key: string, contents: string): Promise<void> {
    await this.ensure();
    await writeFile(this.pathFor(key), contents, 'utf8');
  }
}

/** Real ffprobe/ffmpeg-backed tools; the plugin takes this via injection so it stays testable. */
export function ffmpegSubtitleTools(timeoutMs = 60_000): SubtitleTools {
  return {
    async probe(absolutePath) {
      const { stdout } = await execFileAsync('ffprobe', ['-v', 'error', '-select_streams', 's', '-show_entries', 'stream=index,codec_name:stream_tags=language,title:stream_disposition=forced', '-of', 'json', absolutePath], { timeout: timeoutMs, maxBuffer: 1024 * 1024 });
      const parsed = JSON.parse(stdout) as { streams?: Array<{ index: number; codec_name?: string; tags?: { language?: string; title?: string }; disposition?: { forced?: number } }> };
      return (parsed.streams ?? []).map((stream) => ({ index: stream.index, codec: stream.codec_name ?? '', language: stream.tags?.language, title: stream.tags?.title, forced: stream.disposition?.forced === 1 }));
    },
    async extract(absolutePath, streamIndex, outputPath) {
      await execFileAsync('ffmpeg', ['-y', '-i', absolutePath, '-map', `0:${streamIndex}`, '-f', 'webvtt', outputPath], { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 });
    },
    async extractAll(absolutePath, targets) {
      if (targets.length === 0) return;
      const args = ['-y', '-i', absolutePath];
      for (const target of targets) args.push('-map', `0:${target.streamIndex}`, '-f', 'webvtt', target.outputPath);
      // One pass costs roughly one read of the file regardless of track count.
      await execFileAsync('ffmpeg', args, { timeout: timeoutMs * Math.max(1, targets.length), maxBuffer: 4 * 1024 * 1024 });
    },
  };
}
