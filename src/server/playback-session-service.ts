import { and, desc, eq, gt, isNull, lt, sql } from 'drizzle-orm';
import type { Database } from './db/client.ts';
import { imageLocalUrl } from './images.ts';
import { mediaItems, playbackSessions, users } from './db/schema.ts';

/** A session with no heartbeat for this long is treated as gone. */
export const SESSION_STALE_AFTER_MS = 90_000;

export type PlayMethod = 'direct' | 'remux' | 'transcode';

export class UnknownSessionError extends Error {}

/**
 * Live playback bookkeeping. Players report start, position, and exit; the
 * admin activity view reads what is still alive. Rows are advisory — a client
 * that vanishes without saying goodbye simply stops heartbeating and ages out.
 */
export class PlaybackSessionService {
  constructor(private readonly db: Database) {}

  async start(input: { userId: string; mediaItemId: string; deviceName?: string; playMethod?: PlayMethod; positionSeconds?: number; durationSeconds?: number }) {
    // One device plays one thing at a time: close anything this user left open
    // on the same title so a reload does not stack duplicate rows.
    await this.db.update(playbackSessions).set({ endedAt: new Date() })
      .where(and(eq(playbackSessions.userId, input.userId), eq(playbackSessions.mediaItemId, input.mediaItemId), isNull(playbackSessions.endedAt)));
    const [session] = await this.db.insert(playbackSessions).values({
      userId: input.userId, mediaItemId: input.mediaItemId, deviceName: input.deviceName,
      playMethod: input.playMethod ?? 'direct',
      positionSeconds: Math.max(0, Math.round(input.positionSeconds ?? 0)),
      durationSeconds: input.durationSeconds != null ? Math.round(input.durationSeconds) : null,
    }).returning({ id: playbackSessions.id });
    return session;
  }

  /** Advance a live session. Only its owner may report on it. */
  async heartbeat(sessionId: string, userId: string, update: { positionSeconds?: number; paused?: boolean }) {
    const [row] = await this.db.update(playbackSessions).set({
      positionSeconds: update.positionSeconds != null ? Math.max(0, Math.round(update.positionSeconds)) : undefined,
      paused: update.paused,
      lastReportedAt: new Date(),
    }).where(and(eq(playbackSessions.id, sessionId), eq(playbackSessions.userId, userId), isNull(playbackSessions.endedAt)))
      .returning({ id: playbackSessions.id });
    if (!row) throw new UnknownSessionError('Unknown playback session');
    return row;
  }

  async stop(sessionId: string, userId: string) {
    const [row] = await this.db.update(playbackSessions).set({ endedAt: new Date() })
      .where(and(eq(playbackSessions.id, sessionId), eq(playbackSessions.userId, userId), isNull(playbackSessions.endedAt)))
      .returning({ id: playbackSessions.id });
    // Stopping twice is not an error: players end sessions on both pagehide and unmount.
    return row ?? null;
  }

  /** What the server is streaming right now, newest first. */
  async listActive() {
    const cutoff = new Date(Date.now() - SESSION_STALE_AFTER_MS);
    const rows = await this.db.select({
      id: playbackSessions.id,
      username: users.username,
      deviceName: playbackSessions.deviceName,
      playMethod: playbackSessions.playMethod,
      positionSeconds: playbackSessions.positionSeconds,
      durationSeconds: playbackSessions.durationSeconds,
      paused: playbackSessions.paused,
      startedAt: playbackSessions.startedAt,
      lastReportedAt: playbackSessions.lastReportedAt,
      mediaItemId: mediaItems.id,
      title: mediaItems.title,
      userTitle: mediaItems.userTitle,
      kind: mediaItems.kind,
      seasonNumber: mediaItems.seasonNumber,
      episodeNumber: mediaItems.episodeNumber,
      posterPath: mediaItems.posterPath,
      backdropPath: mediaItems.backdropPath,
    }).from(playbackSessions)
      .innerJoin(users, eq(users.id, playbackSessions.userId))
      .innerJoin(mediaItems, eq(mediaItems.id, playbackSessions.mediaItemId))
      .where(and(isNull(playbackSessions.endedAt), gt(playbackSessions.lastReportedAt, cutoff)))
      .orderBy(desc(playbackSessions.startedAt));

    return rows.map((row) => ({
      id: row.id,
      username: row.username,
      deviceName: row.deviceName,
      playMethod: row.playMethod as PlayMethod,
      positionSeconds: row.positionSeconds,
      durationSeconds: row.durationSeconds,
      paused: row.paused,
      startedAt: row.startedAt,
      lastReportedAt: row.lastReportedAt,
      item: {
        id: row.mediaItemId,
        title: row.userTitle ?? row.title,
        kind: row.kind,
        seasonNumber: row.seasonNumber ?? undefined,
        episodeNumber: row.episodeNumber ?? undefined,
        posterUrl: imageLocalUrl(row.posterPath),
        backdropUrl: imageLocalUrl(row.backdropPath),
      },
    }));
  }

  /**
   * What this account has watched, most recent first. Built from recorded
   * sessions rather than from resume points, so re-watches and finished titles
   * both appear, and a title watched across several sittings collapses into the
   * most recent one.
   */
  async history(userId: string, limit = 50) {
    const rows = await this.db.select({
      id: playbackSessions.id,
      mediaItemId: mediaItems.id,
      title: mediaItems.title,
      userTitle: mediaItems.userTitle,
      kind: mediaItems.kind,
      seasonNumber: mediaItems.seasonNumber,
      episodeNumber: mediaItems.episodeNumber,
      posterPath: mediaItems.posterPath,
      backdropPath: mediaItems.backdropPath,
      deviceName: playbackSessions.deviceName,
      positionSeconds: playbackSessions.positionSeconds,
      durationSeconds: playbackSessions.durationSeconds,
      startedAt: playbackSessions.startedAt,
      lastReportedAt: playbackSessions.lastReportedAt,
    }).from(playbackSessions)
      .innerJoin(mediaItems, eq(mediaItems.id, playbackSessions.mediaItemId))
      .where(eq(playbackSessions.userId, userId))
      .orderBy(desc(playbackSessions.lastReportedAt))
      .limit(Math.min(Math.max(limit, 1), 200) * 4);

    const seen = new Set<string>();
    const history = [];
    for (const row of rows) {
      if (seen.has(row.mediaItemId)) continue;
      seen.add(row.mediaItemId);
      history.push({
        id: row.id,
        watchedAt: row.lastReportedAt,
        startedAt: row.startedAt,
        deviceName: row.deviceName,
        positionSeconds: row.positionSeconds,
        durationSeconds: row.durationSeconds,
        item: {
          id: row.mediaItemId,
          title: row.userTitle ?? row.title,
          kind: row.kind,
          seasonNumber: row.seasonNumber ?? undefined,
          episodeNumber: row.episodeNumber ?? undefined,
          posterUrl: imageLocalUrl(row.posterPath),
          backdropUrl: imageLocalUrl(row.backdropPath),
        },
      });
      if (history.length >= limit) break;
    }
    return history;
  }

  /** Forget one entry, or the whole history, for this account. */
  async forget(userId: string, mediaItemId?: string) {
    await this.db.delete(playbackSessions).where(
      mediaItemId
        ? and(eq(playbackSessions.userId, userId), eq(playbackSessions.mediaItemId, mediaItemId))
        : eq(playbackSessions.userId, userId),
    );
  }

  /** Close sessions whose client stopped reporting; called before listing. */
  async closeStale() {
    const cutoff = new Date(Date.now() - SESSION_STALE_AFTER_MS);
    await this.db.update(playbackSessions).set({ endedAt: sql`now()` })
      .where(and(isNull(playbackSessions.endedAt), lt(playbackSessions.lastReportedAt, cutoff)));
  }
}
