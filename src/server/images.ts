import { mkdir, writeFile, access, rename, rm } from 'node:fs/promises';
import { join, parse } from 'node:path';
import { randomUUID } from 'node:crypto';
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

/** What a stored image is for, which decides the sizes worth generating up front. */
export type ArtworkRole = 'poster' | 'backdrop' | 'still' | 'profile' | 'logo';

/**
 * The sizes screens actually ask for, generated when the artwork is downloaded.
 * Resizing a TMDB original costs tens to hundreds of milliseconds, and left to
 * the request it lands on whoever opens a title first — the page then waits on
 * sharp before the browser has a byte to decode. Anything not listed here is
 * still generated on demand by the route.
 */
export const VARIANT_PRESETS: Record<ArtworkRole, readonly ImageVariantOptions[]> = {
  // Carousels and grids, then the details page's larger poster.
  poster: [{ width: 384, height: 576, fit: 'cover', format: 'webp' }, { width: 600, height: 900, fit: 'cover', format: 'webp' }],
  // The billboard on home, details and the player, then landscape cards.
  backdrop: [{ width: 1920, height: 1080, fit: 'cover', format: 'webp', quality: 85 }, { width: 640, height: 360, fit: 'cover', format: 'webp' }],
  // Episode stills: the season page's list, and a home tile when nothing else exists.
  still: [{ width: 640, height: 360, fit: 'cover', format: 'webp' }, { width: 384, height: 576, fit: 'cover', format: 'webp' }],
  profile: [{ width: 96, height: 96, fit: 'cover', format: 'webp' }, { width: 128, height: 128, fit: 'cover', format: 'webp' }],
  logo: [{ width: 500, format: 'webp' }],
};

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
    // Originals are large single-use reads, so stream them rather than holding
    // the whole image; webp at a lower effort encodes about a third faster for
    // a couple of percent of size, which is the better trade for artwork.
    const encoding = options.format === 'webp' || options.format === 'avif'
      ? { quality: options.quality, effort: 2 }
      : { quality: options.quality };
    await sharp(source, { sequentialRead: true })
      .rotate()
      .resize({ width: options.width, height: options.height, fit: options.fit, withoutEnlargement: true })
      .toFormat(options.format, encoding)
      .toFile(temporary);
    await rename(temporary, target);
  }
}

/** Downloads TMDB artwork into the local config directory during scans. */
export class ImageStore {
  private readonly variants: ImageVariantStore;

  constructor(private readonly directory: string, private readonly fetcher: Fetcher = fetch) {
    this.variants = new ImageVariantStore(directory);
  }

  path(name: string): string {
    return join(this.directory, name);
  }

  /**
   * Fetch and persist an image once, then generate the sizes screens ask for.
   * A `role` is what makes the second half possible; without one the artwork is
   * still stored, and the first viewer pays for the resize instead.
   */
  async cache(tmdbPath: string | null | undefined, role?: ArtworkRole): Promise<void> {
    if (!tmdbPath) return;
    const name = imageFileName(tmdbPath);
    if (!name) return;
    const target = this.path(name);
    let stored = true;
    try { await access(target); } catch { stored = false; }
    if (!stored) {
      const response = await this.fetcher(`${TMDB_IMAGE_BASE}${tmdbPath}`);
      if (!response.ok) return;
      const buffer = Buffer.from(await response.arrayBuffer());
      await mkdir(this.directory, { recursive: true });
      await writeFile(target, buffer);
    }
    // Warming runs for artwork that was already on disk too, so a library
    // scanned before this existed fills its variants on the next scan.
    if (role) await this.warm(name, role);
  }

  /** Best effort: a source sharp cannot read must not fail a scan. */
  private async warm(name: string, role: ArtworkRole): Promise<void> {
    for (const preset of VARIANT_PRESETS[role]) {
      try { await this.variants.get(name, preset); } catch { /* the route will try again on demand */ }
    }
  }
}

/**
 * Stores artwork a user uploaded rather than artwork a provider supplied.
 *
 * Uploads arrive as arbitrary bytes, so nothing is trusted: sharp re-encodes
 * every file into a bounded webp, which both normalizes the format and drops
 * anything that was not really an image. The generated name is random, so one
 * upload can never overwrite another user's cover.
 */
export class UploadedImageStore {
  constructor(private readonly directory: string) {}

  /** Re-encode and persist an upload; resolves to the filename to serve. */
  async save(data: Buffer, prefix = 'upload'): Promise<string> {
    const encoded = await sharp(data)
      .rotate()
      .resize({ width: 1000, height: 1500, fit: 'cover', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
    const name = `${prefix}-${randomUUID()}.webp`;
    await mkdir(this.directory, { recursive: true });
    await writeFile(join(this.directory, name), encoded);
    return name;
  }

  /** Deleting a cover that is already gone is not an error. */
  async remove(name: string): Promise<void> {
    await rm(join(this.directory, name), { force: true }).catch(() => undefined);
  }
}
