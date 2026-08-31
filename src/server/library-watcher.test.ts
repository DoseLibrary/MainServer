import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FSWatcher } from 'chokidar';
import { LibraryWatcher } from './library-watcher.ts';

class FakeWatcher extends EventEmitter {
  close = vi.fn(async () => undefined);
}

function databaseWithLibraries(rows = [{ id: 'library-1', name: 'Movies', rootPath: '/media', enabled: true }]) {
  const where = vi.fn(async () => rows);
  const from = vi.fn(() => ({ where }));
  return { select: vi.fn(() => ({ from })) };
}

function mutableDatabase(read: () => Array<{ id: string; name: string; rootPath: string; enabled: boolean }>) {
  return { select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(async () => read().filter((row) => row.enabled)) })) })) };
}

describe('LibraryWatcher', () => {
  afterEach(() => vi.useRealTimers());

  it('watches enabled roots and collapses video event bursts into one reconciliation', async () => {
    vi.useFakeTimers();
    const native = new FakeWatcher();
    const reconcileLibrary = vi.fn(async () => null);
    const watcher = new LibraryWatcher(databaseWithLibraries() as never, { reconcileLibrary }, { error: vi.fn(), info: vi.fn() }, 100, () => native as unknown as FSWatcher);
    await watcher.start();

    native.emit('add', '/media/Movie.mp4');
    native.emit('change', '/media/Movie.mp4');
    native.emit('unlink', '/media/Old.mkv');
    native.emit('add', '/media/poster.jpg');
    await vi.advanceTimersByTimeAsync(100);

    expect(reconcileLibrary).toHaveBeenCalledOnce();
    expect(reconcileLibrary).toHaveBeenCalledWith('library-1');
    await watcher.stop();
    expect(native.close).toHaveBeenCalledOnce();
  });

  it('isolates watcher and reconciliation errors', async () => {
    vi.useFakeTimers();
    const native = new FakeWatcher();
    const logger = { error: vi.fn(), info: vi.fn() };
    const reconcileLibrary = vi.fn(async () => { throw new Error('temporary scan failure'); });
    const watcher = new LibraryWatcher(databaseWithLibraries() as never, { reconcileLibrary }, logger, 50, () => native as unknown as FSWatcher);
    await watcher.start();

    native.emit('error', new Error('temporary watch failure'));
    native.emit('unlink', '/media/Movie.mp4');
    await vi.advanceTimersByTimeAsync(50);

    expect(logger.error).toHaveBeenCalledTimes(2);
    await watcher.stop();
  });

  it('creates no native watchers when there are no enabled libraries', async () => {
    const factory = vi.fn();
    const watcher = new LibraryWatcher(databaseWithLibraries([]) as never, { reconcileLibrary: vi.fn() }, { error: vi.fn(), info: vi.fn() }, 100, factory);
    await watcher.start();
    expect(factory).not.toHaveBeenCalled();
    await watcher.stop();
  });

  it('adds a watcher when a library is created or enabled after startup', async () => {
    let rows: Array<{ id: string; name: string; rootPath: string; enabled: boolean }> = [];
    const native = new FakeWatcher();
    const factory = vi.fn(() => native as unknown as FSWatcher);
    const watcher = new LibraryWatcher(mutableDatabase(() => rows) as never, { reconcileLibrary: vi.fn() }, { error: vi.fn(), info: vi.fn() }, 100, factory);
    await watcher.start();
    expect(factory).not.toHaveBeenCalled();

    rows = [{ id: 'later', name: 'Shows', rootPath: '/shows', enabled: true }];
    await watcher.synchronize();
    expect(factory).toHaveBeenCalledOnce();
    expect(factory).toHaveBeenCalledWith('/shows');
    await watcher.stop();
  });

  it('stops watching and cancels queued work when a library is disabled or removed', async () => {
    vi.useFakeTimers();
    let rows = [{ id: 'library-1', name: 'Movies', rootPath: '/media', enabled: true }];
    const native = new FakeWatcher();
    const reconcileLibrary = vi.fn(async () => null);
    const watcher = new LibraryWatcher(mutableDatabase(() => rows) as never, { reconcileLibrary }, { error: vi.fn(), info: vi.fn() }, 100, () => native as unknown as FSWatcher);
    await watcher.start();
    native.emit('unlink', '/media/Movie.mp4');

    rows = [];
    await watcher.synchronize();
    await vi.advanceTimersByTimeAsync(100);

    expect(native.close).toHaveBeenCalledOnce();
    expect(reconcileLibrary).not.toHaveBeenCalled();
    await watcher.stop();
  });
});
