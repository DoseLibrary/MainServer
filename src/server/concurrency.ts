export class Semaphore {
  private active = 0;
  private readonly waiting: Array<() => void> = [];
  constructor(readonly limit: number) {}
  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.active++;
    try { return await work(); }
    finally { this.active--; this.waiting.shift()?.(); }
  }
}

/**
 * Run `work` over every item with at most `limit` in flight, aborting the
 * remaining items when `signal` fires. Item errors are the caller's concern:
 * `work` decides whether to swallow or rethrow.
 */
export async function mapPool<T>(items: readonly T[], limit: number, work: (item: T) => Promise<void>, signal?: AbortSignal): Promise<void> {
  let cursor = 0;
  let failure: unknown;
  const worker = async () => {
    while (cursor < items.length && failure === undefined) {
      if (signal?.aborted) throw signal.reason ?? new Error('Cancelled');
      const item = items[cursor++];
      try { await work(item); }
      catch (cause) { failure = failure ?? cause; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, Math.max(items.length, 1)) }, worker));
  if (failure !== undefined) throw failure;
}
