import type { z } from 'zod';
import type { PluginEventMap, PluginEventName } from './events.ts';

export type PluginMetadata = {
  name: string;
  description: string;
  version: string;
};

/** Declarative description of one settings input. Drives the admin form only;
 * `settingsSchema` stays the authority on what is actually accepted. */
export type PluginFieldDescriptor =
  | { kind: 'text' | 'password' | 'path'; key: string; label: string; description?: string; placeholder?: string; required?: boolean; group?: string }
  | { kind: 'number'; key: string; label: string; description?: string; min?: number; max?: number; step?: number; required?: boolean; group?: string }
  | { kind: 'boolean'; key: string; label: string; description?: string; group?: string }
  | { kind: 'select' | 'multiselect'; key: string; label: string; description?: string; options: { value: string; label: string }[]; group?: string }
  | { kind: 'list'; key: string; label: string; description?: string; placeholder?: string; itemLabel?: string; group?: string };

export type PluginRunResult = { summary?: string };

export type PluginRunContext<TSettings extends Record<string, unknown>> = {
  settings: TSettings;
  signal: AbortSignal;
};

/** An operator-triggered operation beyond "run now", rendered as a button. */
export type PluginAction<TSettings extends Record<string, unknown> = Record<string, unknown>> = {
  id: string;
  label: string;
  description?: string;
  confirm?: string;
  run(context: PluginRunContext<TSettings>): Promise<PluginRunResult | void>;
};

export type PluginEventContext<TSettings extends Record<string, unknown>, K extends PluginEventName> = {
  event: K;
  payload: PluginEventMap[K];
  settings: TSettings;
  signal: AbortSignal;
};

export type PluginEventHandlers<TSettings extends Record<string, unknown>> = {
  [K in PluginEventName]?: (context: PluginEventContext<TSettings, K>) => Promise<void> | void;
};

export type PluginDefinition<TSettings extends Record<string, unknown> = Record<string, unknown>> = {
  id: string;
  metadata: PluginMetadata;
  settingsSchema: z.ZodType<TSettings>;
  fields?: PluginFieldDescriptor[];
  actions?: PluginAction<TSettings>[];
  events?: PluginEventHandlers<TSettings>;
  /** Optional: a plugin may react to events only and never be scheduled. */
  run?(context: PluginRunContext<TSettings>): Promise<PluginRunResult | void>;
};

export type RegisteredPlugin = PluginDefinition<Record<string, unknown>>;
