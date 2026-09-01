import { describe, expect, it } from 'vitest';
import { LoginThrottle } from './login-throttle.ts';

describe('login throttling', () => {
  const throttleAt = () => {
    let now = 1_000_000;
    const throttle = new LoginThrottle(() => now);
    return { throttle, advance: (ms: number) => { now += ms; } };
  };

  it('lets ordinary mistakes through and stops a guessing run', () => {
    const { throttle } = throttleAt();

    for (let attempt = 0; attempt < 10; attempt++) {
      expect(throttle.retryAfterMs('1.2.3.4', 'filip')).toBe(0);
      throttle.recordFailure('1.2.3.4', 'filip');
    }

    expect(throttle.retryAfterMs('1.2.3.4', 'filip')).toBeGreaterThan(0);
  });

  it('slows a distributed guess against one account', () => {
    const { throttle } = throttleAt();

    // Ten different addresses, one target.
    for (let attempt = 0; attempt < 10; attempt++) throttle.recordFailure(`10.0.0.${attempt}`, 'filip');

    expect(throttle.retryAfterMs('10.0.0.99', 'filip')).toBeGreaterThan(0);
    // Another account from a fresh address is unaffected.
    expect(throttle.retryAfterMs('10.0.0.99', 'guest')).toBe(0);
  });

  it('treats the account name case-insensitively', () => {
    const { throttle } = throttleAt();
    for (let attempt = 0; attempt < 10; attempt++) throttle.recordFailure(`10.0.0.${attempt}`, 'Filip');

    expect(throttle.retryAfterMs('10.0.1.1', 'filip ')).toBeGreaterThan(0);
  });

  it('forgives with time', () => {
    const { throttle, advance } = throttleAt();
    for (let attempt = 0; attempt < 10; attempt++) throttle.recordFailure('1.2.3.4', 'filip');
    expect(throttle.retryAfterMs('1.2.3.4', 'filip')).toBeGreaterThan(0);

    advance(16 * 60 * 1000);

    expect(throttle.retryAfterMs('1.2.3.4', 'filip')).toBe(0);
  });

  it('a correct password clears the account, not the address', () => {
    const { throttle } = throttleAt();
    for (let attempt = 0; attempt < 25; attempt++) throttle.recordFailure('1.2.3.4', 'filip');

    throttle.recordSuccess('filip');

    // The account is forgiven; the noisy address is still limited.
    expect(throttle.retryAfterMs('5.6.7.8', 'filip')).toBe(0);
    expect(throttle.retryAfterMs('1.2.3.4', 'anything')).toBeGreaterThan(0);
  });
});
