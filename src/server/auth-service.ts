import { eq, sql } from 'drizzle-orm';
import type { Database } from './db/client.ts';
import { libraries, sessions, users } from './db/schema.ts';
import { createSessionToken, DUMMY_PASSWORD_HASH, hashPassword, hashSessionToken, SESSION_TTL_MS, verifyPassword } from './security.ts';

export type PublicUser = { id: string; username: string; role: 'admin' | 'member' };
export type ManagedUser = PublicUser & { disabled: boolean; createdAt: Date; updatedAt: Date };
export class DuplicateLibraryError extends Error {}
export class DuplicateUsernameError extends Error {}
export class UserInvariantError extends Error {}
export class UserNotFoundError extends Error {}

export class AuthService {
  constructor(private readonly db: Database) {}

  async setupRequired() {
    const [row] = await this.db.select({ count: sql<number>`count(*)::int` }).from(users);
    return row.count === 0;
  }

  async setup(username: string, password: string) {
    return this.db.transaction(async (tx) => {
      // Serialize first-run setup attempts across every application instance.
      await tx.execute(sql`select pg_advisory_xact_lock(1146044741)`);
      const [count] = await tx.select({ count: sql<number>`count(*)::int` }).from(users);
      if (count.count !== 0) throw new Error('SETUP_COMPLETE');
      const [user] = await tx.insert(users).values({ username, passwordHash: await hashPassword(password), role: 'admin' }).returning();
      const token = createSessionToken();
      await tx.insert(sessions).values({ userId: user.id, tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + SESSION_TTL_MS) });
      return { user: this.publicUser(user), token };
    });
  }

  async login(username: string, password: string) {
    const [user] = await this.db.select().from(users).where(eq(users.username, username)).limit(1);
    const validPassword = await verifyPassword(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!user || user.disabled || !validPassword) return null;
    const token = createSessionToken();
    await this.db.insert(sessions).values({ userId: user.id, tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + SESSION_TTL_MS) });
    return { user: this.publicUser(user), token };
  }

  async authenticate(token?: string) {
    if (!token) return null;
    const [row] = await this.db.select({ user: users, expiresAt: sessions.expiresAt }).from(sessions).innerJoin(users, eq(sessions.userId, users.id))
      .where(eq(sessions.tokenHash, hashSessionToken(token))).limit(1);
    return row && !row.user.disabled && row.expiresAt > new Date() ? this.publicUser(row.user) : null;
  }

  async logout(token?: string) {
    if (token) await this.db.delete(sessions).where(eq(sessions.tokenHash, hashSessionToken(token)));
  }

  async listLibraries() { return this.db.select().from(libraries).orderBy(libraries.name); }
  async createLibrary(value: typeof libraries.$inferInsert) {
    try { return (await this.db.insert(libraries).values(value).returning())[0]; }
    catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') throw new DuplicateLibraryError('Library already exists');
      throw error;
    }
  }
  async deleteLibrary(id: string) { return (await this.db.delete(libraries).where(eq(libraries.id, id)).returning({ id: libraries.id }))[0] ?? null; }

  async listUsers(): Promise<ManagedUser[]> {
    return this.db.select({ id: users.id, username: users.username, role: users.role, disabled: users.disabled, createdAt: users.createdAt, updatedAt: users.updatedAt }).from(users).orderBy(users.username);
  }

  async createUser(value: { username: string; password: string; role: 'admin' | 'member' }): Promise<ManagedUser> {
    try {
      const [user] = await this.db.insert(users).values({ username: value.username, passwordHash: await hashPassword(value.password), role: value.role })
        .returning({ id: users.id, username: users.username, role: users.role, disabled: users.disabled, createdAt: users.createdAt, updatedAt: users.updatedAt });
      return user;
    } catch (error) {
      if (isUniqueViolation(error)) throw new DuplicateUsernameError('Username already exists');
      throw error;
    }
  }

  async updateUser(actorId: string, targetId: string, change: { role?: 'admin' | 'member'; disabled?: boolean; password?: string }): Promise<ManagedUser> {
    const passwordHash = change.password ? await hashPassword(change.password) : undefined;
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(1146044742)`);
      const [target] = await tx.select().from(users).where(eq(users.id, targetId)).limit(1);
      if (!target) throw new UserNotFoundError('User not found');
      if (actorId === targetId && (change.disabled === true || change.role === 'member')) throw new UserInvariantError('You cannot disable or demote your own account');
      const removesEnabledAdmin = target.role === 'admin' && !target.disabled && (change.role === 'member' || change.disabled === true);
      if (removesEnabledAdmin && await enabledAdminCount(tx) <= 1) throw new UserInvariantError('Dose must have at least one enabled administrator');
      const [updated] = await tx.update(users).set({ role: change.role, disabled: change.disabled, passwordHash, updatedAt: new Date() }).where(eq(users.id, targetId))
        .returning({ id: users.id, username: users.username, role: users.role, disabled: users.disabled, createdAt: users.createdAt, updatedAt: users.updatedAt });
      if (change.disabled === true || passwordHash) await tx.delete(sessions).where(eq(sessions.userId, targetId));
      return updated;
    });
  }

  async deleteUser(actorId: string, targetId: string) {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(1146044742)`);
      const [target] = await tx.select().from(users).where(eq(users.id, targetId)).limit(1);
      if (!target) throw new UserNotFoundError('User not found');
      if (actorId === targetId) throw new UserInvariantError('You cannot delete your own account');
      if (target.role === 'admin' && !target.disabled && await enabledAdminCount(tx) <= 1) throw new UserInvariantError('Dose must have at least one enabled administrator');
      await tx.delete(sessions).where(eq(sessions.userId, targetId));
      await tx.delete(users).where(eq(users.id, targetId));
    });
  }

  private publicUser(user: typeof users.$inferSelect): PublicUser {
    return { id: user.id, username: user.username, role: user.role };
  }
}

function isUniqueViolation(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

async function enabledAdminCount(database: Pick<Database, 'select'>) {
  const [row] = await database.select({ count: sql<number>`count(*)::int` }).from(users).where(sql`${users.role} = 'admin' and ${users.disabled} = false`);
  return row.count;
}
