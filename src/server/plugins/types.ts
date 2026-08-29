import type { z } from 'zod';

export type PluginMetadata = {
  name: string;
  description: string;
  version: string;
};

export type PluginSettingMetadata = {
  label: string;
  description?: string;
  secret?: boolean;
};

export type PluginRunResult = { summary?: string };

export type PluginRunContext<TSettings extends Record<string, unknown>> = {
  settings: TSettings;
  signal: AbortSignal;
};

export type PluginDefinition<TSettings extends Record<string, unknown> = Record<string, unknown>> = {
  id: string;
  metadata: PluginMetadata;
  settingsSchema: z.ZodType<TSettings>;
  settings?: Record<keyof TSettings & string, PluginSettingMetadata>;
  run(context: PluginRunContext<TSettings>): Promise<PluginRunResult | void>;
};

export type RegisteredPlugin = PluginDefinition<Record<string, unknown>>;
