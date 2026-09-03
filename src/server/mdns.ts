import Bonjour, { type Service, type ServiceConfig } from 'bonjour-service';
import type { AppConfig } from './config.ts';

/** Hostname advertised for the A record; the LAN address(es) of every
 * non-internal interface are attached to it automatically by bonjour-service. */
export const MDNS_HOSTNAME = 'dose.local';
export const MDNS_SERVICE_TYPE = 'dose';
export const API_BASE_PATH = '/api/v1';

export interface MdnsLogger {
  info(details: unknown, message?: string): void;
  warn(details: unknown, message?: string): void;
}

/** Pure record construction, kept separate from the network so it can be
 * unit tested: name/type/port/host plus a TXT record a client can build an
 * origin from without guessing scheme or base path. */
export function buildDoseServiceConfig(config: Pick<AppConfig, 'PORT'>): ServiceConfig {
  return {
    name: 'Dose',
    type: MDNS_SERVICE_TYPE,
    protocol: 'tcp',
    port: config.PORT,
    host: MDNS_HOSTNAME,
    txt: { scheme: 'http', base: API_BASE_PATH },
  };
}

export interface MdnsAdvertiser {
  stop(): Promise<void>;
}

/**
 * Advertises the running server as `dose.local` (A record) plus a
 * `_dose._tcp.local` service record, so a client can find it without typing
 * an IP. Must only be called once the HTTP server is actually listening.
 * Never throws: a network that refuses multicast (containers, some VMs) is
 * logged and the server keeps running without discovery.
 */
export function startMdnsAdvertiser(config: Pick<AppConfig, 'PORT' | 'MDNS_ENABLED'>, log: MdnsLogger): MdnsAdvertiser | null {
  if (config.MDNS_ENABLED === false) return null;
  try {
    const onError = (error: Error) => log.warn({ error }, 'mdns responder error; continuing without local discovery');
    const bonjour = new Bonjour(undefined, onError);
    let service: Service;
    try {
      service = bonjour.publish(buildDoseServiceConfig(config));
    } catch (error) {
      bonjour.destroy();
      onError(error as Error);
      return null;
    }
    service.on('error', onError);
    log.info({ hostname: MDNS_HOSTNAME, port: config.PORT }, 'advertising dose via mdns');
    return {
      stop: () => new Promise((resolve) => {
        bonjour.unpublishAll(() => { bonjour.destroy(); resolve(); });
      }),
    };
  } catch (error) {
    log.warn({ error }, 'failed to start mdns advertiser; continuing without local discovery');
    return null;
  }
}
