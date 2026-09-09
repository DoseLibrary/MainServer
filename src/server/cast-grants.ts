import { randomBytes } from 'node:crypto';

/**
 * A short-lived bearer for a Chromecast. The receiver cannot present the
 * viewer's cookie, so the stream and subtitle routes it fetches are opened by
 * a token minted at negotiation time instead, carrying the viewer's maturity
 * limit so parental controls still hold on the television.
 */
export interface CastGrant {
  itemId: string;
  /** Encoded playback plan; absent for a direct-play source. */
  plan?: string;
  maturityLimit: number | null;
}

interface StoredGrant extends CastGrant { expiresAt: number }

const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;

export class CastGrantStore {
  private readonly grants = new Map<string, StoredGrant>();
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly cap: number;

  constructor(options: { ttlMs?: number; now?: () => number; cap?: number } = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.now = options.now ?? Date.now;
    this.cap = options.cap ?? 256;
  }

  get size() { return this.grants.size; }

  mint(grant: CastGrant): string {
    if (this.grants.size >= this.cap) this.sweep();
    const token = randomBytes(32).toString('hex');
    this.grants.set(token, { ...grant, expiresAt: this.now() + this.ttlMs });
    return token;
  }

  get(token: string): CastGrant | null {
    const grant = this.grants.get(token);
    if (!grant) return null;
    if (grant.expiresAt <= this.now()) { this.grants.delete(token); return null; }
    return grant;
  }

  private sweep() {
    const now = this.now();
    for (const [token, grant] of this.grants) if (grant.expiresAt <= now) this.grants.delete(token);
  }
}
