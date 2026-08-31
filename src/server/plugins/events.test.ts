import { describe, expect, it, vi } from 'vitest';
import { PluginEventBus } from './events.ts';

const silent = { error: vi.fn(), warn: vi.fn() };

describe('PluginEventBus', () => {
  it('delivers only to subscribers of the event', async () => {
    const bus = new PluginEventBus({ log: silent });
    const ingested = vi.fn();
    const removed = vi.fn();
    bus.subscribe('a', 'media.file.ingested', ingested);
    bus.subscribe('b', 'media.item.removed', removed);

    bus.emit('media.file.ingested', { libraryId: 'l', mediaItemId: 'i', mediaFileId: 'f', relativePath: 'a.mkv', created: true });
    await bus.drain();

    expect(ingested).toHaveBeenCalledWith('media.file.ingested', expect.objectContaining({ relativePath: 'a.mkv' }));
    expect(removed).not.toHaveBeenCalled();
  });

  it('skips plugins whose configuration is disabled', async () => {
    const handler = vi.fn();
    const bus = new PluginEventBus({ log: silent, isEnabled: (pluginId) => pluginId === 'on' });
    bus.subscribe('off', 'media.item.removed', handler);
    bus.subscribe('on', 'media.item.removed', handler);

    bus.emit('media.item.removed', { mediaItemId: 'x' });
    await bus.drain();

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('never lets a handler failure reach the emitter', async () => {
    const log = { error: vi.fn(), warn: vi.fn() };
    const bus = new PluginEventBus({ log });
    bus.subscribe('boom', 'media.item.removed', () => { throw new Error('handler exploded'); });
    const after = vi.fn();
    bus.subscribe('boom', 'media.item.removed', after);

    expect(() => bus.emit('media.item.removed', { mediaItemId: 'x' })).not.toThrow();
    await bus.drain();

    expect(log.error).toHaveBeenCalledWith(expect.objectContaining({ pluginId: 'boom', error: 'handler exploded' }), expect.any(String));
    expect(after).toHaveBeenCalled();
  });

  it('runs one plugin handlers serially in emit order', async () => {
    const bus = new PluginEventBus({ log: silent });
    const order: string[] = [];
    bus.subscribe('slow', 'media.item.removed', async (_event, payload) => {
      order.push(`start:${payload.mediaItemId}`);
      await new Promise((resolve) => setTimeout(resolve, payload.mediaItemId === 'first' ? 20 : 0));
      order.push(`end:${payload.mediaItemId}`);
    });

    bus.emit('media.item.removed', { mediaItemId: 'first' });
    bus.emit('media.item.removed', { mediaItemId: 'second' });
    await bus.drain();

    expect(order).toEqual(['start:first', 'end:first', 'start:second', 'end:second']);
  });

  it('drops events once a plugin backlog is full instead of buffering without bound', async () => {
    const log = { error: vi.fn(), warn: vi.fn() };
    const bus = new PluginEventBus({ log, maxQueue: 2 });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const handler = vi.fn(async () => { await gate; });
    bus.subscribe('slow', 'media.item.removed', handler);

    for (const mediaItemId of ['1', '2', '3', '4']) bus.emit('media.item.removed', { mediaItemId });
    release();
    await bus.drain();

    expect(handler).toHaveBeenCalledTimes(2);
    expect(bus.droppedCount('slow')).toBe(2);
    expect(log.warn).toHaveBeenCalled();
  });
});
