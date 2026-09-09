import { describe, expect, it } from 'vitest';
import { browseDirectories, type DirectoryLister } from './directory-browser.ts';

function lister(tree: Record<string, string[]>, hidden: string[] = []): DirectoryLister {
  return {
    async listDirectories(path) {
      const key = path.length > 3 ? path.replace(/[\\/]+$/, '') : path;
      const entries = tree[key] ?? tree[path];
      if (!entries) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      return entries.map((name) => ({ name, hidden: hidden.includes(name) }));
    },
    async roots() { return ['C:\\', 'D:\\']; },
  };
}

describe('browseDirectories in a container', () => {
  const fs = lister({ '/media': ['movies', 'shows', '.snapshots'], '/media/movies': ['2020', '2021'] }, ['.snapshots']);

  it('starts at /media and hides dot-directories', async () => {
    const result = await browseDirectories(undefined, { native: false, filesystem: fs });
    expect(result).toEqual({ path: '/media', parent: null, entries: [
      { name: 'movies', path: '/media/movies' }, { name: 'shows', path: '/media/shows' },
    ] });
  });

  it('descends and offers the parent on the way back', async () => {
    const result = await browseDirectories('/media/movies', { native: false, filesystem: fs });
    expect(result.parent).toBe('/media');
    expect(result.entries.map((entry) => entry.path)).toEqual(['/media/movies/2020', '/media/movies/2021']);
  });

  it('refuses to leave /media', async () => {
    await expect(browseDirectories('/etc', { native: false, filesystem: fs })).rejects.toThrow(/below \/media/);
    await expect(browseDirectories('/media/../etc', { native: false, filesystem: fs })).rejects.toThrow();
  });
});

describe('browseDirectories on a native host', () => {
  const fs = lister({ 'C:\\': ['Users', 'Media'], 'C:\\Media': ['Movies'] });

  it('lists drives when no path is given', async () => {
    const result = await browseDirectories(undefined, { native: true, filesystem: fs, platform: 'win32' });
    expect(result).toEqual({ path: null, parent: null, entries: [{ name: 'C:\\', path: 'C:\\' }, { name: 'D:\\', path: 'D:\\' }] });
  });

  it('walks a drive and returns to the drive list from its root', async () => {
    const drive = await browseDirectories('C:\\', { native: true, filesystem: fs, platform: 'win32' });
    expect(drive.parent).toBeNull();
    expect(drive.entries).toEqual([{ name: 'Users', path: 'C:\\Users' }, { name: 'Media', path: 'C:\\Media' }]);
    const media = await browseDirectories('C:\\Media', { native: true, filesystem: fs, platform: 'win32' });
    expect(media.parent).toBe('C:\\');
    expect(media.entries).toEqual([{ name: 'Movies', path: 'C:\\Media\\Movies' }]);
  });

  it('rejects a relative path', async () => {
    await expect(browseDirectories('Media', { native: true, filesystem: fs, platform: 'win32' })).rejects.toThrow(/absolute/);
  });

  it('reports a missing directory as such', async () => {
    await expect(browseDirectories('C:\\Nope', { native: true, filesystem: fs, platform: 'win32' })).rejects.toThrow(/accessible/);
  });
});
