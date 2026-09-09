import { posix, win32 } from 'node:path';
import { readdir, stat } from 'node:fs/promises';

export interface DirectoryEntry { name: string; path: string }
export interface DirectoryListing { path: string | null; parent: string | null; entries: DirectoryEntry[] }

/** What the browser needs from the host: child directories of a path, and drive roots. */
export interface DirectoryLister {
  listDirectories(path: string): Promise<Array<{ name: string; hidden?: boolean }>>;
  /** Top-level entry points on a native host (drive letters on Windows). */
  roots(): Promise<string[]>;
}

export interface BrowseOptions {
  /** Native development lists host drives; a container is confined to /media. */
  native: boolean;
  filesystem?: DirectoryLister;
  platform?: NodeJS.Platform;
}

const CONTAINER_ROOT = '/media';

export const nodeDirectoryLister: DirectoryLister = {
  async listDirectories(path) {
    const entries = await readdir(path, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => ({ name: entry.name, hidden: entry.name.startsWith('.') }));
  },
  async roots() {
    if (process.platform !== 'win32') return ['/'];
    const letters = Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index));
    const found = await Promise.all(letters.map(async (letter) => {
      try { return (await stat(`${letter}:\\`)).isDirectory() ? `${letter}:\\` : null; } catch { return null; }
    }));
    return found.filter((drive): drive is string => drive != null);
  },
};

/**
 * One level of the directory tree for the library path picker. Never lists
 * files: the admin is choosing a folder, and file names are none of the
 * picker's business.
 */
export async function browseDirectories(requested: string | undefined, options: BrowseOptions): Promise<DirectoryListing> {
  const filesystem = options.filesystem ?? nodeDirectoryLister;
  const platform = options.platform ?? process.platform;
  const path = options.native ? (platform === 'win32' ? win32 : posix) : posix;

  if (!options.native) {
    const target = containerPath(requested);
    const entries = await children(filesystem, target, (name) => path.posix.join(target, name));
    return { path: target, parent: target === CONTAINER_ROOT ? null : path.posix.dirname(target), entries };
  }

  if (!requested) {
    const roots = await filesystem.roots();
    return { path: null, parent: null, entries: roots.map((root) => ({ name: root, path: root })) };
  }
  if (!path.isAbsolute(requested)) throw new Error('Path must be absolute');
  const target = path.normalize(requested);
  const atRoot = path.dirname(target) === target;
  const entries = await children(filesystem, target, (name) => path.join(target, name));
  return { path: target, parent: atRoot ? null : path.dirname(target), entries };
}

function containerPath(requested: string | undefined): string {
  if (!requested) return CONTAINER_ROOT;
  if (requested.includes('\\') || requested.split('/').includes('..')) throw new Error('Path must be below /media');
  const normalized = posix.normalize(requested).replace(/\/$/, '');
  if (normalized !== CONTAINER_ROOT && !normalized.startsWith(`${CONTAINER_ROOT}/`)) throw new Error('Path must be below /media');
  return normalized;
}

async function children(filesystem: DirectoryLister, target: string, join: (name: string) => string): Promise<DirectoryEntry[]> {
  let listed: Array<{ name: string; hidden?: boolean }>;
  try { listed = await filesystem.listDirectories(target); }
  catch { throw new Error('Path must be an accessible directory'); }
  return listed.filter((entry) => !entry.hidden).map((entry) => ({ name: entry.name, path: join(entry.name) }));
}
