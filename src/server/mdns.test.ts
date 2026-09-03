import { describe, expect, it, vi } from 'vitest';
import { buildDoseServiceConfig, MDNS_HOSTNAME, MDNS_SERVICE_TYPE, startMdnsAdvertiser } from './mdns.ts';
import { loadConfig } from './config.ts';

describe('buildDoseServiceConfig', () => {
  it('advertises dose.local on the configured port with a scheme and API base in TXT', () => {
    const record = buildDoseServiceConfig({ PORT: 4180 });
    expect(record).toMatchObject({
      name: 'Dose',
      type: MDNS_SERVICE_TYPE,
      protocol: 'tcp',
      port: 4180,
      host: MDNS_HOSTNAME,
      txt: { scheme: 'http', base: '/api/v1' },
    });
  });
});

describe('MDNS_ENABLED config parsing', () => {
  it('defaults to enabled', () => {
    const config = loadConfig({ DATABASE_URL: 'postgresql://db', NODE_ENV: 'test' });
    expect(config.MDNS_ENABLED).toBe(true);
  });
  it('can be opted out via the env var', () => {
    const config = loadConfig({ DATABASE_URL: 'postgresql://db', NODE_ENV: 'test', MDNS_ENABLED: 'false' });
    expect(config.MDNS_ENABLED).toBe(false);
  });
});

describe('startMdnsAdvertiser', () => {
  it('does nothing and returns null when disabled', () => {
    const log = { info: vi.fn(), warn: vi.fn() };
    expect(startMdnsAdvertiser({ PORT: 3000, MDNS_ENABLED: false }, log)).toBeNull();
    expect(log.info).not.toHaveBeenCalled();
    expect(log.warn).not.toHaveBeenCalled();
  });
});
