import { and, eq, lt, or } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import type { Database } from './db/client.ts';
import { deviceAuthRequests, sessions } from './db/schema.ts';
import { createSessionToken, DEVICE_SESSION_TTL_MS, hashSessionToken } from './security.ts';

/** Pairing requests are short-lived: a code on a TV screen is a standing invitation. */
export const DEVICE_CODE_TTL_MS = 10 * 60 * 1000;
/** Devices must wait this long between polls; faster polls are told to slow down. */
export const DEVICE_POLL_INTERVAL_MS = 2_000;

/** Ambiguous characters (0/O, 1/I) are excluded so codes survive being read off a TV. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

export class DeviceAuthError extends Error {
  constructor(readonly reason: 'not_found' | 'expired' | 'already_used' | 'slow_down') { super(reason); }
}

export type DevicePollResult =
  | { status: 'pending' }
  | { status: 'denied' }
  | { status: 'approved'; token: string; userId: string };

function generateUserCode() {
  const bytes = randomBytes(CODE_LENGTH);
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** Accepts a code with or without its dash, in any case. */
export function normalizeUserCode(value: string) {
  const bare = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return bare.length === CODE_LENGTH ? `${bare.slice(0, 4)}-${bare.slice(4)}` : bare;
}

/**
 * The QR device flow: a device starts a request and shows its user code, the
 * owner approves that code from an already signed-in phone, and the device
 * exchanges its secret device code for a session.
 */
export class DeviceAuthService {
  constructor(private readonly db: Database) {}

  /** Start a pairing request. The device code is returned once and never stored. */
  async start(deviceName: string) {
    await this.pruneExpired();
    const deviceCode = createSessionToken();
    const expiresAt = new Date(Date.now() + DEVICE_CODE_TTL_MS);
    // A user-code collision is possible but vanishingly rare; retry rather than fail the device.
    for (let attempt = 0; attempt < 5; attempt++) {
      const userCode = generateUserCode();
      try {
        const [request] = await this.db.insert(deviceAuthRequests)
          .values({ userCode, deviceCodeHash: hashSessionToken(deviceCode), deviceName, expiresAt })
          .returning({ id: deviceAuthRequests.id });
        return { id: request.id, userCode, deviceCode, expiresAt, intervalMs: DEVICE_POLL_INTERVAL_MS };
      } catch (cause) {
        if (!isUniqueViolation(cause) || attempt === 4) throw cause;
      }
    }
    throw new Error('Could not allocate a device code');
  }

  /** Details shown on the approval screen, by user code. */
  async describe(userCode: string) {
    const [request] = await this.db.select({
      id: deviceAuthRequests.id, deviceName: deviceAuthRequests.deviceName,
      status: deviceAuthRequests.status, expiresAt: deviceAuthRequests.expiresAt,
      createdAt: deviceAuthRequests.createdAt,
    }).from(deviceAuthRequests).where(eq(deviceAuthRequests.userCode, normalizeUserCode(userCode))).limit(1);
    if (!request) throw new DeviceAuthError('not_found');
    if (request.expiresAt <= new Date()) throw new DeviceAuthError('expired');
    if (request.status !== 'pending') throw new DeviceAuthError('already_used');
    return request;
  }

  /** Approve or deny a pending request on behalf of the signed-in user. */
  async resolve(userCode: string, userId: string, decision: 'approved' | 'denied') {
    await this.describe(userCode);
    const [updated] = await this.db.update(deviceAuthRequests)
      .set({ status: decision, userId: decision === 'approved' ? userId : null, approvedAt: new Date() })
      .where(and(eq(deviceAuthRequests.userCode, normalizeUserCode(userCode)), eq(deviceAuthRequests.status, 'pending')))
      .returning({ id: deviceAuthRequests.id, deviceName: deviceAuthRequests.deviceName });
    // A concurrent approval already resolved it; the device gets that outcome.
    if (!updated) throw new DeviceAuthError('already_used');
    return updated;
  }

  /**
   * Exchange a device code for a session once approved. Returns `pending` until
   * the user decides, and consumes the request on success so a leaked device
   * code cannot mint a second session.
   */
  async poll(deviceCode: string): Promise<DevicePollResult> {
    const hash = hashSessionToken(deviceCode);
    const [request] = await this.db.select().from(deviceAuthRequests).where(eq(deviceAuthRequests.deviceCodeHash, hash)).limit(1);
    if (!request || request.claimedAt) throw new DeviceAuthError('not_found');
    if (request.expiresAt <= new Date()) throw new DeviceAuthError('expired');
    if (request.lastPolledAt && Date.now() - request.lastPolledAt.getTime() < DEVICE_POLL_INTERVAL_MS) throw new DeviceAuthError('slow_down');
    await this.db.update(deviceAuthRequests).set({ lastPolledAt: new Date() }).where(eq(deviceAuthRequests.id, request.id));

    if (request.status === 'pending') return { status: 'pending' };
    if (request.status === 'denied') return { status: 'denied' };

    const token = createSessionToken();
    const userId = request.userId!;
    await this.db.transaction(async (tx) => {
      // Claim inside the transaction so two racing polls cannot both mint a session.
      const [claimed] = await tx.update(deviceAuthRequests).set({ claimedAt: new Date() })
        .where(and(eq(deviceAuthRequests.id, request.id), eq(deviceAuthRequests.status, 'approved')))
        .returning({ id: deviceAuthRequests.id });
      if (!claimed) throw new DeviceAuthError('already_used');
      await tx.insert(sessions).values({
        userId, tokenHash: hashSessionToken(token), deviceName: request.deviceName, createdVia: 'device',
        expiresAt: new Date(Date.now() + DEVICE_SESSION_TTL_MS),
      });
    });
    return { status: 'approved', token, userId };
  }

  /** Signed-in devices for a user, newest first, with the current one marked. */
  async listSessions(userId: string, currentToken?: string) {
    const rows = await this.db.select({
      id: sessions.id, deviceName: sessions.deviceName, createdVia: sessions.createdVia,
      createdAt: sessions.createdAt, lastSeenAt: sessions.lastSeenAt, expiresAt: sessions.expiresAt,
      tokenHash: sessions.tokenHash,
    }).from(sessions).where(eq(sessions.userId, userId));
    const currentHash = currentToken ? hashSessionToken(currentToken) : undefined;
    return rows
      .sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime())
      .map(({ tokenHash, ...row }) => ({ ...row, current: tokenHash === currentHash }));
  }

  /** Revoke one of the user's own sessions; signing out that device immediately. */
  async revokeSession(userId: string, sessionId: string) {
    const [removed] = await this.db.delete(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
      .returning({ id: sessions.id });
    if (!removed) throw new DeviceAuthError('not_found');
    return removed;
  }

  /** Expired and long-claimed requests are noise; drop them opportunistically. */
  private async pruneExpired() {
    await this.db.delete(deviceAuthRequests)
      .where(or(lt(deviceAuthRequests.expiresAt, new Date()), lt(deviceAuthRequests.claimedAt, new Date(Date.now() - DEVICE_CODE_TTL_MS))));
  }
}

function isUniqueViolation(cause: unknown) {
  return typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === '23505';
}
