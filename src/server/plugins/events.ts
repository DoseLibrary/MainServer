/**
 * Domain events core publishes for plugins.
 *
 * Delivery is in-memory and fire-and-forget: an event is never persisted, so a
 * crash or restart drops whatever was still queued. Every plugin that reacts to
 * events keeps its scheduled sweep as the reconciliation backstop.
 */
export type PluginEventMap = {
  'library.scan.started': { libraryId: string; scanId: string };
  'library.scan.completed': { libraryId: string; scanId: string; processed: number; failed: number };
  'media.file.ingested': { libraryId: string; mediaItemId: string; mediaFileId: string; relativePath: string; created: boolean };
  'media.item.enriched': { libraryId: string; mediaItemId: string; kind: 'movie' | 'series' | 'episode'; providerIds: Record<string, unknown> };
  'media.item.archived': { mediaItemId: string };
  'media.item.unarchived': { mediaItemId: string };
  'media.item.removed': { mediaItemId: string };
  'playback.progress.updated': { userId: string; mediaItemId: string; positionSeconds: number; watched: boolean };
};

export type PluginEventName = keyof PluginEventMap;

export const PLUGIN_EVENT_NAMES: PluginEventName[] = [
  'library.scan.started', 'library.scan.completed', 'media.file.ingested', 'media.item.enriched',
  'media.item.archived', 'media.item.unarchived', 'media.item.removed', 'playback.progress.updated',
];

export type PluginEventDelivery<K extends PluginEventName = PluginEventName> = (event: K, payload: PluginEventMap[K]) => Promise<void> | void;

export type PluginEventBusOptions = {
  /** Delivery is skipped for plugins this predicate rejects (disabled configurations). */
  isEnabled?: (pluginId: string) => boolean;
  log?: { error(details: Record<string, unknown>, message: string): void; warn(details: Record<string, unknown>, message: string): void };
  /** Per-plugin backlog cap. Overflow is dropped rather than buffered without bound. */
  maxQueue?: number;
};

const DEFAULT_MAX_QUEUE = 100;

type Subscription = { pluginId: string; deliver: PluginEventDelivery };

export class PluginEventBus {
  private readonly subscriptions = new Map<PluginEventName, Subscription[]>();
  private readonly queues = new Map<string, { chain: Promise<void>; depth: number }>();
  private readonly dropped = new Map<string, number>();
  private readonly maxQueue: number;

  constructor(private readonly options: PluginEventBusOptions = {}) {
    this.maxQueue = options.maxQueue ?? DEFAULT_MAX_QUEUE;
  }

  subscribe<K extends PluginEventName>(pluginId: string, event: K, deliver: PluginEventDelivery<K>) {
    const existing = this.subscriptions.get(event) ?? [];
    existing.push({ pluginId, deliver: deliver as PluginEventDelivery });
    this.subscriptions.set(event, existing);
    return this;
  }

  /** Drop every subscription belonging to a plugin (re-wiring on reload). */
  unsubscribeAll(pluginId: string) {
    for (const [event, list] of this.subscriptions) {
      const remaining = list.filter((entry) => entry.pluginId !== pluginId);
      if (remaining.length) this.subscriptions.set(event, remaining);
      else this.subscriptions.delete(event);
    }
  }

  /** Synchronous and never throwing: emitting must not change core behaviour. */
  emit<K extends PluginEventName>(event: K, payload: PluginEventMap[K]): void {
    const listeners = this.subscriptions.get(event);
    if (!listeners?.length) return;
    for (const listener of listeners) {
      if (this.options.isEnabled && !this.options.isEnabled(listener.pluginId)) continue;
      this.enqueue(listener, event, payload);
    }
  }

  droppedCount(pluginId: string) { return this.dropped.get(pluginId) ?? 0; }

  /** Await every queued handler. Test helper; production code never blocks on delivery. */
  async drain() {
    while ([...this.queues.values()].some((queue) => queue.depth > 0)) {
      await Promise.all([...this.queues.values()].map((queue) => queue.chain));
    }
  }

  private enqueue<K extends PluginEventName>(listener: Subscription, event: K, payload: PluginEventMap[K]) {
    const queue = this.queues.get(listener.pluginId) ?? { chain: Promise.resolve(), depth: 0 };
    this.queues.set(listener.pluginId, queue);
    if (queue.depth >= this.maxQueue) {
      const dropped = (this.dropped.get(listener.pluginId) ?? 0) + 1;
      this.dropped.set(listener.pluginId, dropped);
      this.options.log?.warn({ pluginId: listener.pluginId, event, dropped }, 'plugin event dropped: backlog full');
      return;
    }
    queue.depth += 1;
    // Handlers of one plugin run in order; a slow plugin never blocks another.
    queue.chain = queue.chain.then(async () => {
      try { await listener.deliver(event, payload); }
      catch (cause) { this.options.log?.error({ pluginId: listener.pluginId, event, error: errorMessage(cause) }, 'plugin event handler failed'); }
      finally { queue.depth -= 1; }
    });
  }
}

function errorMessage(cause: unknown) {
  return (cause instanceof Error ? cause.message : String(cause)).slice(0, 2_000);
}
