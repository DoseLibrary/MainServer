import { spawn } from 'node:child_process';
import { mkdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { and, eq, inArray, lt, or } from 'drizzle-orm';
import type { Database } from './db/client.ts';
import { downloadGrants, mediaItems } from './db/schema.ts';
import { Semaphore } from './concurrency.ts';
import {
  buildDownloadArgs, DOWNLOAD_PROFILES, estimateBytes,
  type DownloadProfileId,
} from './download-profiles.ts';

/** How long a downloaded copy stays playable on the device. */
export const DOWNLOAD_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Simultaneous encodes, kept low so downloads cannot starve live playback. */
const ENCODE_CONCURRENCY = 2;

export class UnknownGrantError extends Error {}
export class GrantNotReadyError extends Error {}

/** Encoding is injected so tests do not need ffmpeg to exercise the lifecycle. */
export interface DownloadEncoder {
  encode(args: string[], signal: AbortSignal): Promise<void>;
}

export function ffmpegDownloadEncoder(): DownloadEncoder {
  return {
    encode(args, signal) {
      return new Promise((resolve, reject) => {
        const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
        const stderr: Buffer[] = [];
        const abort = () => child.kill('SIGKILL');
        signal.addEventListener('abort', abort, { once: true });
        child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
        child.once('error', reject);
        child.once('close', (code) => {
          signal.removeEventListener('abort', abort);
          if (code === 0) resolve();
          else reject(new Error(`ffmpeg exited with code ${code}: ${Buffer.concat(stderr).toString().slice(0, 300)}`));
        });
      });
    },
  };
}

export type GrantView = {
  id: string;
  mediaItemId: string;
  title: string;
  profile: DownloadProfileId;
  status: 'preparing' | 'ready' | 'claimed' | 'failed';
  sizeBytes: number | null;
  estimatedBytes: number;
  error: string | null;
  expiresAt: Date;
};

/**
 * Prepares offline copies.
 *
 * A grant is requested, encoded in the background, fetched by the device, and
 * then forgotten: the file exists only between "ready" and the device saying it
 * has the bytes. The row survives so an interrupted transfer resumes and so the
 * device's expiry date came from somewhere it cannot edit.
 */
export class DownloadService {
  private readonly encodes = new Semaphore(ENCODE_CONCURRENCY);
  private readonly running = new Map<string, AbortController>();

  constructor(
    private readonly db: Database,
    private readonly storageDir: string,
    private readonly encoder: DownloadEncoder = ffmpegDownloadEncoder(),
    private readonly ttlMs = DOWNLOAD_TTL_MS,
  ) {}

  /**
   * Start preparing a copy. Returns immediately; the encode runs in the
   * background so a season can be queued without holding a request open.
   */
  async request(input: {
    userId: string; mediaItemId: string; profile: DownloadProfileId;
    sourcePath: string; durationSeconds: number | null; title: string;
  }): Promise<GrantView> {
    const profile = DOWNLOAD_PROFILES[input.profile];
    const estimated = estimateBytes(input.durationSeconds ?? 0, profile);
    const [grant] = await this.db.insert(downloadGrants).values({
      userId: input.userId, mediaItemId: input.mediaItemId, profile: input.profile,
      estimatedBytes: estimated, expiresAt: new Date(Date.now() + this.ttlMs),
    }).returning();

    void this.encode(grant.id, input.sourcePath, input.profile).catch(() => { /* recorded on the row */ });
    return this.view(grant, input.title);
  }

  private async encode(grantId: string, sourcePath: string, profileId: DownloadProfileId) {
    await mkdir(this.storageDir, { recursive: true });
    const filePath = join(this.storageDir, `${grantId}.mp4`);
    const controller = new AbortController();
    this.running.set(grantId, controller);
    try {
      await this.encodes.run(() => this.encoder.encode(
        buildDownloadArgs(sourcePath, filePath, DOWNLOAD_PROFILES[profileId]), controller.signal));
      const info = await stat(filePath);
      await this.db.update(downloadGrants)
        .set({ status: 'ready', filePath, sizeBytes: info.size, updatedAt: new Date() })
        .where(eq(downloadGrants.id, grantId));
    } catch (cause) {
      await rm(filePath, { force: true }).catch(() => undefined);
      await this.db.update(downloadGrants).set({
        status: 'failed', filePath: null,
        error: (cause instanceof Error ? cause.message : String(cause)).slice(0, 500),
        updatedAt: new Date(),
      }).where(eq(downloadGrants.id, grantId));
    } finally {
      this.running.delete(grantId);
    }
  }

  /** One grant belonging to this user, with its title for the queue display. */
  async get(userId: string, grantId: string): Promise<GrantView> {
    const [row] = await this.db.select({ grant: downloadGrants, title: mediaItems.title, userTitle: mediaItems.userTitle })
      .from(downloadGrants).innerJoin(mediaItems, eq(mediaItems.id, downloadGrants.mediaItemId))
      .where(and(eq(downloadGrants.id, grantId), eq(downloadGrants.userId, userId))).limit(1);
    if (!row) throw new UnknownGrantError('Unknown download');
    return this.view(row.grant, row.userTitle ?? row.title);
  }

  /** Everything this user has asked for that has not been cleaned up. */
  async list(userId: string): Promise<GrantView[]> {
    const rows = await this.db.select({ grant: downloadGrants, title: mediaItems.title, userTitle: mediaItems.userTitle })
      .from(downloadGrants).innerJoin(mediaItems, eq(mediaItems.id, downloadGrants.mediaItemId))
      .where(eq(downloadGrants.userId, userId));
    return rows
      .sort((a, b) => b.grant.createdAt.getTime() - a.grant.createdAt.getTime())
      .map((row) => this.view(row.grant, row.userTitle ?? row.title));
  }

  /** The encoded file, once it exists. Throws while preparing or after expiry. */
  async fileFor(userId: string, grantId: string): Promise<{ path: string; size: number }> {
    const [row] = await this.db.select().from(downloadGrants)
      .where(and(eq(downloadGrants.id, grantId), eq(downloadGrants.userId, userId))).limit(1);
    if (!row) throw new UnknownGrantError('Unknown download');
    if (row.expiresAt <= new Date()) throw new UnknownGrantError('This download has expired');
    if (row.status !== 'ready' || !row.filePath || row.sizeBytes == null) throw new GrantNotReadyError(row.status);
    return { path: row.filePath, size: row.sizeBytes };
  }

  /**
   * The device has the whole file: drop the server copy. The row stays so the
   * device's expiry can be checked and the title can be re-requested later.
   */
  async claim(userId: string, grantId: string): Promise<void> {
    const [row] = await this.db.update(downloadGrants)
      .set({ status: 'claimed', claimedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(downloadGrants.id, grantId), eq(downloadGrants.userId, userId)))
      .returning({ filePath: downloadGrants.filePath });
    if (!row) throw new UnknownGrantError('Unknown download');
    if (row.filePath) await rm(row.filePath, { force: true }).catch(() => undefined);
    await this.db.update(downloadGrants).set({ filePath: null }).where(eq(downloadGrants.id, grantId));
  }

  /** Abandon a download: stop any encode and remove whatever exists. */
  async cancel(userId: string, grantId: string): Promise<void> {
    const [row] = await this.db.select().from(downloadGrants)
      .where(and(eq(downloadGrants.id, grantId), eq(downloadGrants.userId, userId))).limit(1);
    if (!row) throw new UnknownGrantError('Unknown download');
    this.running.get(grantId)?.abort();
    if (row.filePath) await rm(row.filePath, { force: true }).catch(() => undefined);
    await this.db.delete(downloadGrants).where(eq(downloadGrants.id, grantId));
  }

  /**
   * Remove files the device will never come back for: claimed, failed, and
   * expired grants. Runs on boot and hourly.
   */
  async sweep(): Promise<number> {
    const rows = await this.db.select().from(downloadGrants).where(or(
      inArray(downloadGrants.status, ['claimed', 'failed']),
      lt(downloadGrants.expiresAt, new Date()),
    ));
    let removed = 0;
    for (const row of rows) {
      if (row.filePath) { await rm(row.filePath, { force: true }).catch(() => undefined); removed++; }
    }
    await this.db.update(downloadGrants).set({ filePath: null })
      .where(inArray(downloadGrants.id, rows.map((row) => row.id).length ? rows.map((row) => row.id) : ['00000000-0000-0000-0000-000000000000']));
    // An expired grant is dead weight; the device enforces its own copy's expiry.
    await this.db.delete(downloadGrants).where(lt(downloadGrants.expiresAt, new Date()));
    return removed;
  }

  /** Stop in-flight encodes so shutdown is not blocked. */
  abortAll(): void {
    for (const controller of this.running.values()) controller.abort();
  }

  private view(grant: typeof downloadGrants.$inferSelect, title: string): GrantView {
    return {
      id: grant.id, mediaItemId: grant.mediaItemId, title,
      profile: grant.profile as DownloadProfileId,
      status: grant.status, sizeBytes: grant.sizeBytes, estimatedBytes: grant.estimatedBytes,
      error: grant.error, expiresAt: grant.expiresAt,
    };
  }
}
