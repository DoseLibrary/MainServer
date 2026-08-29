import { describe, expect, it } from 'vitest';
import { createSessionToken, hashPassword, hashSessionToken, normalizeLibraryRoot, resolveLibraryRoot, resolveNativeLibraryRoot, verifyPassword, type LibraryFilesystem } from './security.ts';

describe('security helpers', () => {
  it('hashes passwords with a verifiable memory-hard hash', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).not.toContain('correct horse');
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
    expect(await verifyPassword('wrong password', hash)).toBe(false);
  });
  it('creates opaque tokens and stores deterministic hashes', () => {
    const token = createSessionToken();
    expect(token.length).toBeGreaterThan(32);
    expect(hashSessionToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashSessionToken(token)).not.toContain(token);
  });
  it('normalizes valid media roots', () => expect(normalizeLibraryRoot('/media/movies/')).toBe('/media/movies'));
  it.each(['/etc', '/media', '/media/', 'media/movies', '/media/a/../secret', '/media\\movies'])('rejects unsafe root %s', (root) => expect(() => normalizeLibraryRoot(root)).toThrow());
  it('accepts a real directory contained by the real media root', async () => {
    const fs: LibraryFilesystem = { realpath: async (path) => path === '/media' ? '/mnt/media' : '/mnt/media/movies', isDirectory: async () => true };
    await expect(resolveLibraryRoot('/media/movies', fs)).resolves.toBe('/mnt/media/movies');
  });
  it('rejects a symlink escaping the real media root', async () => {
    const fs: LibraryFilesystem = { realpath: async (path) => path === '/media' ? '/mnt/media' : '/private/movies', isDirectory: async () => true };
    await expect(resolveLibraryRoot('/media/movies', fs)).rejects.toThrow('below /media');
  });
  it('rejects non-directories', async () => {
    const fs: LibraryFilesystem = { realpath: async (path) => path, isDirectory: async () => false };
    await expect(resolveLibraryRoot('/media/movie.mkv', fs)).rejects.toThrow('accessible directory');
  });
  it('accepts an absolute Windows directory in native development', async () => {
    const fs: LibraryFilesystem = { realpath: async () => 'D:\\Media\\Movies', isDirectory: async () => true };
    await expect(resolveNativeLibraryRoot('D:\\Media\\Movies', fs)).resolves.toBe('D:\\Media\\Movies');
  });
  it('rejects relative native development paths', async () => {
    const fs: LibraryFilesystem = { realpath: async (path) => path, isDirectory: async () => true };
    await expect(resolveNativeLibraryRoot('Media\\Movies', fs)).rejects.toThrow('absolute host path');
  });
});
