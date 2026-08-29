import type { PluginDefinition, RegisteredPlugin } from './types.ts';

export class DuplicatePluginError extends Error {}
export class UnknownPluginError extends Error {}

export class PluginRegistry {
  private readonly plugins = new Map<string, RegisteredPlugin>();

  register<T extends Record<string, unknown>>(plugin: PluginDefinition<T>) {
    if (!plugin.id.trim()) throw new Error('Plugin ID must not be empty');
    if (this.plugins.has(plugin.id)) throw new DuplicatePluginError(`Plugin already registered: ${plugin.id}`);
    this.plugins.set(plugin.id, plugin as RegisteredPlugin);
    return this;
  }

  get(id: string): RegisteredPlugin {
    const plugin = this.plugins.get(id);
    if (!plugin) throw new UnknownPluginError(`Unknown plugin: ${id}`);
    return plugin;
  }

  list() { return [...this.plugins.values()]; }
}
