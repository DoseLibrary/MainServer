import { createHash, randomBytes } from 'node:crypto';
import { isAbsolute, posix } from 'node:path';
import { realpath, stat } from 'node:fs/promises';
import { argon2id, hash, verify } from 'argon2';

export const SESSION_COOKIE = 'dose_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const DUMMY_PASSWORD_HASH = '$argon2id$v=19$m=65536,p=4,t=3$eHBmb2FFV+eTKddtBTIUcA$1j70Q7tF59vZl0T39ApEe1zvw0HIS+5SeB5Ijx1Lu9Y';

export interface LibraryFilesystem {
  realpath(path: string): Promise<string>;
  isDirectory(path: string): Promise<boolean>;
}

export const nodeLibraryFilesystem: LibraryFilesystem = {
  realpath,
  async isDirectory(path) { return (await stat(path)).isDirectory(); },
};

export async function hashPassword(password: string) {
  return hash(password, { type: argon2id, memoryCost: 65_536, timeCost: 3 });
}

export async function verifyPassword(password: string, hash: string) {
  return verify(hash, password);
}

export function createSessionToken() {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function normalizeLibraryRoot(value: string) {
  if (value.includes('\\') || value.split('/').includes('..')) throw new Error('Library root must not contain traversal');
  const normalized = posix.normalize(value);
  if (!posix.isAbsolute(normalized) || normalized === '/media/' || !normalized.startsWith('/media/')) {
    throw new Error('Library root must be an absolute path below /media');
  }
  return normalized.replace(/\/$/, '');
}

export async function resolveLibraryRoot(value: string, filesystem: LibraryFilesystem = nodeLibraryFilesystem) {
  const normalized = normalizeLibraryRoot(value);
  const [mediaRoot, libraryRoot] = await Promise.all([filesystem.realpath('/media'), filesystem.realpath(normalized)]);
  const relative = posix.relative(mediaRoot, libraryRoot);
  if (!relative || relative === '..' || relative.startsWith('../') || posix.isAbsolute(relative)) {
    throw new Error('Library root must resolve to a directory below /media');
  }
  if (!await filesystem.isDirectory(libraryRoot)) throw new Error('Library root must be an accessible directory');
  return libraryRoot;
}

/** Resolve an arbitrary host directory for native development (never Docker/production). */
export async function resolveNativeLibraryRoot(value: string, filesystem: LibraryFilesystem = nodeLibraryFilesystem) {
  if (!isAbsolute(value)) throw new Error('Library root must be an absolute host path');
  let libraryRoot: string;
  try { libraryRoot = await filesystem.realpath(value); }
  catch { throw new Error('Library root must be an accessible directory'); }
  if (!await filesystem.isDirectory(libraryRoot)) throw new Error('Library root must be an accessible directory');
  return libraryRoot;
}
