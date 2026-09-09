import { describe, expect, it } from 'vitest';
import { CastGrantStore } from './cast-grants.ts';

const ITEM = '20000000-0000-4000-8000-000000000001';

describe('CastGrantStore', () => {
  it('mints a 64-hex token that resolves to its grant until it expires', () => {
    let now = 1_000;
    const store = new CastGrantStore({ ttlMs: 100, now: () => now });
    const token = store.mint({ itemId: ITEM, maturityLimit: null });
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(store.get(token)).toMatchObject({ itemId: ITEM, maturityLimit: null });
    now = 1_101;
    expect(store.get(token)).toBeNull();
  });

  it('never hands out a grant for an unknown token', () => {
    expect(new CastGrantStore().get('f'.repeat(64))).toBeNull();
  });

  it('sweeps expired grants once it grows past the cap', () => {
    let now = 0;
    const store = new CastGrantStore({ ttlMs: 10, now: () => now, cap: 2 });
    const stale = store.mint({ itemId: ITEM, maturityLimit: null });
    store.mint({ itemId: ITEM, maturityLimit: null });
    now = 11;
    store.mint({ itemId: ITEM, maturityLimit: null });
    expect(store.size).toBe(1);
    expect(store.get(stale)).toBeNull();
  });
});
