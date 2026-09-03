import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from './auth-service.ts';
import type { Database } from './db/client.ts';
import { DeviceAuthError, DeviceAuthService, normalizeUserCode } from './device-auth-service.ts';
import { DEVICE_SESSION_TTL_MS, SESSION_TTL_MS } from './security.ts';

describe('DeviceAuthService', () => {
  let client: PGlite;
  let database: Database;
  let devices: DeviceAuthService;
  let auth: AuthService;
  let userId: string;

  beforeEach(async () => {
    client = new PGlite('memory://');
    database = drizzle(client) as unknown as Database;
    await migrate(database as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') });
    devices = new DeviceAuthService(database);
    auth = new AuthService(database);
    userId = (await auth.setup('owner', 'long-enough-password')).user.id;
  });

  afterEach(async () => { await client.close(); });

  /** Polls are rate limited by wall clock; tests move the stamp back instead of waiting. */
  const allowPoll = () => client.query(`update device_auth_requests set last_polled_at = null`);

  it('normalizes a code typed without its dash or in lower case', () => {
    expect(normalizeUserCode('k7qp2m4x')).toBe('K7QP-2M4X');
    expect(normalizeUserCode(' K7QP-2M4X ')).toBe('K7QP-2M4X');
  });

  it('pairs a device once the owner approves the code', async () => {
    const started = await devices.start('TV in the den');
    expect(started.userCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(await devices.poll(started.deviceCode)).toEqual({ status: 'pending' });

    const shown = await devices.describe(started.userCode);
    expect(shown).toMatchObject({ deviceName: 'TV in the den', status: 'pending' });
    await devices.resolve(started.userCode, userId, 'approved');

    await allowPoll();
    const result = await devices.poll(started.deviceCode);
    expect(result.status).toBe('approved');
    // The minted session is a real one, tied to the approving user and named.
    const session = result.status === 'approved' ? result : undefined;
    expect(await auth.authenticate(session!.token)).toMatchObject({ id: userId, username: 'owner' });
    const sessions = await devices.listSessions(userId, session!.token);
    expect(sessions[0]).toMatchObject({ deviceName: 'TV in the den', createdVia: 'device', current: true });
  });

  it('mints a paired session with the long device TTL, not the browser one', async () => {
    const started = await devices.start('TV in the den');
    await devices.resolve(started.userCode, userId, 'approved');
    await allowPoll();
    const before = Date.now();
    await devices.poll(started.deviceCode);

    const [row] = await devices.listSessions(userId);
    const ttlMs = row.expiresAt.getTime() - before;
    expect(ttlMs).toBeGreaterThan(SESSION_TTL_MS);
    expect(ttlMs).toBeLessThanOrEqual(DEVICE_SESSION_TTL_MS + 5_000);
    expect(ttlMs).toBeGreaterThan(DEVICE_SESSION_TTL_MS - 5_000);
  });

  it('reports a denial and never mints a session', async () => {
    const started = await devices.start('Shared laptop');
    await devices.resolve(started.userCode, userId, 'denied');

    await allowPoll();
    expect(await devices.poll(started.deviceCode)).toEqual({ status: 'denied' });
    expect(await devices.listSessions(userId)).toHaveLength(1); // only the setup session
  });

  it('consumes an approved request so one approval cannot mint two sessions', async () => {
    const started = await devices.start('TV');
    await devices.resolve(started.userCode, userId, 'approved');
    await allowPoll();
    expect((await devices.poll(started.deviceCode)).status).toBe('approved');

    await allowPoll();
    await expect(devices.poll(started.deviceCode)).rejects.toMatchObject({ reason: 'not_found' });
  });

  it('rejects polls faster than the interval', async () => {
    const started = await devices.start('TV');
    await devices.poll(started.deviceCode);
    await expect(devices.poll(started.deviceCode)).rejects.toMatchObject({ reason: 'slow_down' });
  });

  it('refuses expired codes on both sides of the flow', async () => {
    const started = await devices.start('TV');
    await client.query(`update device_auth_requests set expires_at = now() - interval '1 minute'`);

    await expect(devices.describe(started.userCode)).rejects.toMatchObject({ reason: 'expired' });
    await expect(devices.poll(started.deviceCode)).rejects.toMatchObject({ reason: 'expired' });
  });

  it('refuses a second decision on the same code', async () => {
    const started = await devices.start('TV');
    await devices.resolve(started.userCode, userId, 'approved');
    await expect(devices.resolve(started.userCode, userId, 'denied')).rejects.toBeInstanceOf(DeviceAuthError);
  });

  it('revokes only the caller own sessions', async () => {
    const other = await auth.createUser({ username: 'guest', password: 'another-long-password', role: 'member' });
    const guestLogin = await auth.login('guest', 'another-long-password');
    const guestSession = (await devices.listSessions(other.id))[0];

    await expect(devices.revokeSession(userId, guestSession.id)).rejects.toMatchObject({ reason: 'not_found' });
    expect(await auth.authenticate(guestLogin!.token)).not.toBeNull();

    await devices.revokeSession(other.id, guestSession.id);
    expect(await auth.authenticate(guestLogin!.token)).toBeNull();
  });
});
