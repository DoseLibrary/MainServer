import { describe, expect, it } from 'vitest';
import { AuthService, DuplicateLibraryError, UserInvariantError } from './auth-service.ts';
import type { Database } from './db/client.ts';

const user = { id: 'user-id', username: 'person', passwordHash: 'hash', role: 'member' as const, disabled: false, createdAt: new Date(), updatedAt: new Date() };

function authDatabase(row: unknown) {
  const query = { from: () => query, innerJoin: () => query, where: () => query, limit: async () => row ? [row] : [] };
  return { select: () => query } as unknown as Database;
}

describe('AuthService session validation', () => {
  it('rejects expired sessions', async () => {
    const service = new AuthService(authDatabase({ user, expiresAt: new Date(Date.now() - 1_000) }));
    await expect(service.authenticate('token')).resolves.toBeNull();
  });
  it('rejects disabled users', async () => {
    const service = new AuthService(authDatabase({ user: { ...user, disabled: true }, expiresAt: new Date(Date.now() + 10_000) }));
    await expect(service.authenticate('token')).resolves.toBeNull();
  });
  it('accepts an active session', async () => {
    const service = new AuthService(authDatabase({ user, expiresAt: new Date(Date.now() + 10_000) }));
    await expect(service.authenticate('token')).resolves.toEqual({ id: 'user-id', username: 'person', role: 'member' });
  });
  it('maps postgres unique violations to a domain error', async () => {
    const returning = async () => { throw Object.assign(new Error('private database detail'), { code: '23505' }); };
    const database = { insert: () => ({ values: () => ({ returning }) }) } as unknown as Database;
    await expect(new AuthService(database).createLibrary({ name: 'Movies', kind: 'movies', rootPath: '/media/movies' })).rejects.toBeInstanceOf(DuplicateLibraryError);
  });
});

function managementDatabase(target: Omit<typeof user, 'role'> & { role: 'admin' | 'member'; disabled: boolean }, adminCount: number) {
  const deleted: unknown[] = [];
  const tx = {
    execute: async () => undefined,
    select: (selection?: Record<string, unknown>) => {
      const result = selection && 'count' in selection ? [{ count: adminCount }] : [target];
      const chain = { from: () => chain, where: () => chain, limit: async () => result, then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve) };
      return chain;
    },
    update: () => ({ set: (change: Record<string, unknown>) => ({ where: () => ({ returning: async () => [{ ...target, ...change }] }) }) }),
    delete: (table: unknown) => ({ where: async () => { deleted.push(table); } }),
  };
  return { database: { transaction: async (callback: (value: typeof tx) => unknown) => callback(tx) } as unknown as Database, deleted };
}

describe('AuthService account invariants', () => {
  const admin = { ...user, id: 'admin-id', role: 'admin' as const };
  it('prevents an administrator from disabling or demoting itself', async () => {
    const { database } = managementDatabase(admin, 2); const service = new AuthService(database);
    await expect(service.updateUser('admin-id', 'admin-id', { disabled: true })).rejects.toBeInstanceOf(UserInvariantError);
    await expect(service.updateUser('admin-id', 'admin-id', { role: 'member' })).rejects.toBeInstanceOf(UserInvariantError);
  });
  it('preserves the final enabled administrator', async () => {
    const { database } = managementDatabase(admin, 1);
    await expect(new AuthService(database).deleteUser('other-admin', 'admin-id')).rejects.toThrow('at least one enabled');
  });
  it('revokes sessions when disabling an account', async () => {
    const member = { ...user, id: 'member-id', role: 'member' as const }; const { database, deleted } = managementDatabase(member, 1);
    await new AuthService(database).updateUser('admin-id', 'member-id', { disabled: true });
    expect(deleted).toHaveLength(1);
  });
  it('allows deleting another member and revokes sessions first', async () => {
    const member = { ...user, id: 'member-id', role: 'member' as const }; const { database, deleted } = managementDatabase(member, 1);
    await new AuthService(database).deleteUser('admin-id', 'member-id');
    expect(deleted).toHaveLength(2);
  });
});
