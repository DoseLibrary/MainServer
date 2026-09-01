/**
 * Byte-bounded LRU of encoded HLS segments with single-flight fills.
 *
 * On-demand segment encoding pays an ffmpeg spawn per request. Caching the
 * output makes segment boundaries free during sequential playback (readahead
 * fills the next indexes while the current one plays), makes a rewind or a
 * quality switch back instant, and lets several viewers of the same title
 * share one encode.
 */
export class SegmentCache {
  /** Insertion order doubles as recency: get() re-inserts on hit. */
  private readonly entries = new Map<string, Buffer>();
  private readonly inflight = new Map<string, Promise<Buffer>>();
  private bytes = 0;

  constructor(private readonly maxBytes = 256 * 1024 * 1024) {}

  get(key: string): Buffer | undefined {
    const hit = this.entries.get(key);
    if (hit) { this.entries.delete(key); this.entries.set(key, hit); }
    return hit;
  }

  /** Cached or already being encoded — readahead skips these. */
  knows(key: string): boolean {
    return this.entries.has(key) || this.inflight.has(key);
  }

  /** One encode per key, no matter how many callers arrive while it runs. */
  async fill(key: string, encode: () => Promise<Buffer>): Promise<Buffer> {
    const cached = this.get(key);
    if (cached) return cached;
    let pending = this.inflight.get(key);
    if (!pending) {
      pending = encode()
        .then((body) => { this.store(key, body); return body; })
        .finally(() => this.inflight.delete(key));
      this.inflight.set(key, pending);
    }
    return pending;
  }

  get sizeBytes(): number { return this.bytes; }

  private store(key: string, body: Buffer) {
    if (body.byteLength > this.maxBytes) return;
    const existing = this.entries.get(key);
    if (existing) { this.bytes -= existing.byteLength; this.entries.delete(key); }
    this.entries.set(key, body);
    this.bytes += body.byteLength;
    for (const [oldest, buffer] of this.entries) {
      if (this.bytes <= this.maxBytes) break;
      if (oldest === key) continue;
      this.entries.delete(oldest);
      this.bytes -= buffer.byteLength;
    }
  }
}
