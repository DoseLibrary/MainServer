import { describe, expect, it, vi } from 'vitest';
import { flushProgressOutbox, type OutboxEntry } from './download-meta.ts';
import { formatBytes, formatExpiry } from './downloads.ts';

/** Stands in for the IndexedDB outbox, with the same newest-wins semantics. */
function memoryOutbox(seed: OutboxEntry[] = []) {
  const entries = new Map(seed.map((entry) => [entry.mediaItemId, entry]));
  return {
    entries,
    all: async () => [...entries.values()],
    clear: async (mediaItemId: string) => { entries.delete(mediaItemId); },
  };
}

describe('the offline progress outbox', () => {
  const entry = (id: string, at: number): OutboxEntry => ({ mediaItemId: id, positionSeconds: 120, watched: false, at });

  it('sends what was watched offline, oldest first, and forgets each as it lands', async () => {
    const outbox = memoryOutbox([entry('b', 2000), entry('a', 1000)]);
    const sent: string[] = [];

    const count = await flushProgressOutbox(async (item) => { sent.push(item.mediaItemId); }, outbox);

    expect(sent).toEqual(['a', 'b']);
    expect(count).toBe(2);
    expect(outbox.entries.size).toBe(0);
  });

  it('keeps everything queued when the connection is still gone', async () => {
    const outbox = memoryOutbox([entry('a', 1000), entry('b', 2000)]);

    const count = await flushProgressOutbox(async () => { throw new Error('offline'); }, outbox);

    expect(count).toBe(0);
    expect(outbox.entries.size).toBe(2);
  });

  it('stops at the first failure so nothing is silently dropped', async () => {
    const outbox = memoryOutbox([entry('a', 1000), entry('b', 2000)]);
    const send = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('connection lost'));

    const count = await flushProgressOutbox(send, outbox);

    expect(count).toBe(1);
    expect([...outbox.entries.keys()]).toEqual(['b']);
  });
});

describe('how downloads are described', () => {
  it('sizes read the way a phone owner thinks about them', () => {
    expect(formatBytes(0)).toBe('0 MB');
    expect(formatBytes(320_000_000)).toBe('320 MB');
    expect(formatBytes(1_500_000_000)).toBe('1.5 GB');
    expect(formatBytes(2_000_000_000)).toBe('2 GB');
    expect(formatBytes(24_000_000_000)).toBe('24 GB');
  });

  it('expiry is counted in days, and says so plainly at the ends', () => {
    const now = Date.parse('2026-09-01T12:00:00Z');
    const inDays = (days: number) => new Date(now + days * 86_400_000).toISOString();

    expect(formatExpiry(inDays(30), now)).toBe('30 days left');
    expect(formatExpiry(inDays(0.5), now)).toBe('Expires today');
    expect(formatExpiry(inDays(-1), now)).toBe('Expired');
  });
});
