import { mkdir, writeFile, access, rename } from 'node:fs/promises';
import { join, parse } from 'node:path';
import sharp from 'sharp';

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/original';

/** Local filename for a TMDB image path such as `/abc123.jpg` -> `abc123.jpg`. */
export function imageFileName(tmdbPath: string): string {
  const parts = tmdbPath.replace(/\\/g, '/').split('/');
  const leaf = parts[parts.length - 1] ?? '';
  return leaf.replace(/[^A-Za-z0-9._-]/g, '').replace(/^\.+/, '');
}

/** Public URL the client fetches; served locally so playback never needs the internet. */
export function imageLocalUrl(tmdbPath: string | null | undefined): string | undefined {
  if (!tmdbPath) return undefined;
  const name = imageFileName(tmdbPath);
  return name ? `/api/v1/images/${name}` : undefined;
}

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export interface ImageVariantOptions {
  width?: number;
  height?: number;
  fit?: 'cover' | 'contain' | 'inside';
  format?: 'jpeg' | 'webp' | 'avif';
  quality?: number;
}

const VARIANT_TYPES = { jpeg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif' } as const;

/** Generates each requested image size once and then serves it from disk. */
export class ImageVariantStore {
  private readonly pending = new Map<string, Promise<void>>();

  constructor(private readonly directory: string) {}

  async get(name: string, options: ImageVariantOptions): Promise<{ path: string; contentType: string }> {
    const source = join(this.directory, name);
    const format = options.format ?? 'webp';
    const quality = options.quality ?? 82;
    const fit = options.fit ?? 'inside';
    const dimensions = `${options.width ?? 'auto'}x${options.height ?? 'auto'}`;
    const stem = parse(name).name.replace(/[^A-Za-z0-9._-]/g, '');
    const variantName = `${stem}-${dimensions}-${fit}-q${quality}.${format === 'jpeg' ? 'jpg' : format}`;
    const target = join(this.directory, '.variants', variantName);
    try { await access(target); return { path: target, contentType: VARIANT_TYPES[format] }; } catch { /* generate below */ }

    let generation = this.pending.get(target);
    if (!generation) {
      generation = this.generate(source, target, { ...options, format, quality, fit }).finally(() => this.pending.delete(target));
      this.pending.set(target, generation);
    }
    await generation;
    return { path: target, contentType: VARIANT_TYPES[format] };
  }

  private async generate(source: string, target: string, options: Required<Pick<ImageVariantOptions, 'format' | 'quality' | 'fit'>> & ImageVariantOptions) {
    await mkdir(join(this.directory, '.variants'), { recursive: true });
    const temporary = `${target}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    await sharp(source)
      .rotate()
      .resize({ width: options.width, height: options.height, fit: options.fit, withoutEnlargement: true })
      .toFormat(options.format, { quality: options.quality })
      .toFile(temporary);
    await rename(temporary, target);
  }
}

/** Downloads TMDB artwork into the local config directory during scans. */
export class ImageStore {
  constructor(private readonly directory: string, private readonly fetcher: Fetcher = fetch) {}

  path(name: string): string {
    return join(this.directory, name);
  }

  /** Fetch and persist an image once; skips work if it already exists on disk. */
  async cache(tmdbPath: string | null | undefined): Promise<void> {
    if (!tmdbPath) return;
    const name = imageFileName(tmdbPath);
    if (!name) return;
    const target = this.path(name);
    try {
      await access(target);
      return; // already cached
    } catch {
      // not cached yet
    }
    const response = await this.fetcher(`${TMDB_IMAGE_BASE}${tmdbPath}`);
    if (!response.ok) return;
    const buffer = Buffer.from(await response.arrayBuffer());
    await mkdir(this.directory, { recursive: true });
    await writeFile(target, buffer);
  }
}
