/**
 * Brute-force protection for the login endpoint.
 *
 * Argon2 makes each guess expensive for us; this makes volume expensive for
 * the attacker. Failures are counted per client address and per account name,
 * so a distributed guess against one account is slowed even when every attempt
 * arrives from a different address.
 *
 * In memory on purpose: a restart forgiving a lockout is fine for a home
 * server, and it keeps the hot path free of database writes.
 */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_ADDRESS = 20;
const MAX_PER_ACCOUNT = 10;
/** Entries this stale are dropped whenever the map is touched. */
const SWEEP_EVERY = 64;

interface Bucket {
  failures: number[];
}

export class LoginThrottle {
  private readonly byAddress = new Map<string, Bucket>();
  private readonly byAccount = new Map<string, Bucket>();
  private touches = 0;

  constructor(private readonly now: () => number = Date.now) {}

  /** Milliseconds the caller must wait, or 0 when the attempt may proceed. */
  retryAfterMs(address: string, username: string): number {
    this.sweepOccasionally();
    const cutoff = this.now() - WINDOW_MS;
    const address_ = this.recent(this.byAddress.get(address), cutoff);
    const account = this.recent(this.byAccount.get(this.accountKey(username)), cutoff);
    if (address_.length < MAX_PER_ADDRESS && account.length < MAX_PER_ACCOUNT) return 0;
    const oldest = Math.min(
      address_.length >= MAX_PER_ADDRESS ? address_[0] : Infinity,
      account.length >= MAX_PER_ACCOUNT ? account[0] : Infinity,
    );
    return Math.max(1_000, oldest + WINDOW_MS - this.now());
  }

  recordFailure(address: string, username: string): void {
    const at = this.now();
    this.push(this.byAddress, address, at);
    this.push(this.byAccount, this.accountKey(username), at);
  }

  /** A correct password clears the account's slate; the address keeps its history. */
  recordSuccess(username: string): void {
    this.byAccount.delete(this.accountKey(username));
  }

  private accountKey(username: string): string {
    return username.trim().toLowerCase();
  }

  private recent(bucket: Bucket | undefined, cutoff: number): number[] {
    if (!bucket) return [];
    bucket.failures = bucket.failures.filter((at) => at > cutoff);
    return bucket.failures;
  }

  private push(map: Map<string, Bucket>, key: string, at: number): void {
    const bucket = map.get(key) ?? { failures: [] };
    bucket.failures.push(at);
    map.set(key, bucket);
  }

  private sweepOccasionally(): void {
    if (++this.touches % SWEEP_EVERY !== 0) return;
    const cutoff = this.now() - WINDOW_MS;
    for (const map of [this.byAddress, this.byAccount]) {
      for (const [key, bucket] of map) {
        if (bucket.failures.every((at) => at <= cutoff)) map.delete(key);
      }
    }
  }
}
