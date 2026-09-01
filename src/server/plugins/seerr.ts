import { z } from 'zod';
import { SeerrClient, type Fetcher } from '../seerr.ts';
import type { PluginDefinition } from './types.ts';

export const seerrSettingsSchema = z.object({
  baseUrl: z.string().default(''),
  apiKey: z.string().default(''),
  /** Ask Seerr for the 4K version, where it has a separate 4K service configured. */
  request4k: z.boolean().default(false),
});

export type SeerrSettings = z.infer<typeof seerrSettingsSchema>;

/** Configured enough to be worth calling. */
export function seerrConfigured(settings: SeerrSettings): boolean {
  return settings.baseUrl.trim().length > 0 && settings.apiKey.trim().length > 0;
}

/**
 * Seerr lives in the plugin system for its settings rather than its schedule:
 * it has no periodic work, but it does have an address, a secret that must
 * never be echoed back to the browser, and an on/off switch — all of which the
 * plugin admin page already handles. The request calls themselves are made by
 * the routes, synchronously, while someone is looking at a collection.
 */
export function createSeerrPlugin(fetcher: Fetcher = fetch): PluginDefinition<SeerrSettings> {
  return {
    id: 'seerr',
    metadata: {
      name: 'Seerr',
      description: 'Request the titles your collections are missing from Seerr, Jellyseerr, or Overseerr.',
      version: '1.0.0',
    },
    settingsSchema: seerrSettingsSchema,
    fields: [
      { kind: 'text', key: 'baseUrl', label: 'Seerr address', description: 'Where Seerr is reachable from this server, e.g. http://seerr:5055', placeholder: 'http://seerr:5055', required: true, group: 'Connection' },
      { kind: 'password', key: 'apiKey', label: 'API key', description: 'Seerr → Settings → General → API Key.', required: true, group: 'Connection' },
      { kind: 'boolean', key: 'request4k', label: 'Request 4K', description: 'Ask for the 4K version. Seerr needs a 4K service configured for this to work.', group: 'Requests' },
    ],
    actions: [
      {
        id: 'test-connection',
        label: 'Test connection',
        description: 'Check the address and API key against the running Seerr.',
        async run({ settings }) {
          const parsed = seerrSettingsSchema.parse(settings);
          // Throwing is how an action reports failure; the message reaches the
          // admin page as the run's error.
          if (!seerrConfigured(parsed)) throw new Error('Set the address and API key first.');
          const { version } = await new SeerrClient(parsed, fetcher).serverStatus();
          return { summary: `Connected to Seerr ${version}.` };
        },
      },
    ],
  };
}
