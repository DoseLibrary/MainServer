import chokidar, { type FSWatcher } from 'chokidar';
import { extname } from 'node:path';
import { eq } from 'drizzle-orm';
import type { Database } from './db/client.ts';
import { libraries } from './db/schema.ts';
import { VIDEO_EXTENSIONS } from './media-parser.ts';
import type { ScanCoordinator } from './scanner.ts';

interface WatchLogger {
  error(error: unknown, message: string): void;
  info(details: unknown, message: string): void;
}

type WatchFactory = (root: string) => FSWatcher;

/** Coalesces filesystem events into resilient per-library reconciliation passes. */
export class LibraryWatcher {
  private readonly watchers = new Map<string, { rootPath: string; watcher: FSWatcher }>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private synchronization: Promise<void> = Promise.resolve();

  constructor(
    private readonly database: Database,
    private readonly scanner: Pick<ScanCoordinator, 'reconcileLibrary'>,
    private readonly logger: WatchLogger,
    private readonly debounceMs: number,
    private readonly watchFactory: WatchFactory = (root) => chokidar.watch(root, { ignoreInitial: true, persistent: true }),
  ) {}

  async start(): Promise<void> {
    await this.synchronize();
  }

  /** Match native watchers to the current set of enabled libraries. Idempotent and serialized. */
  synchronize(): Promise<void> {
    this.synchronization = this.synchronization.then(() => this.synchronizeNow(), () => this.synchronizeNow());
    return this.synchronization;
  }

  private async synchronizeNow(): Promise<void> {
    const enabledLibraries = await this.database.select().from(libraries).where(eq(libraries.enabled, true));
    const enabledIds = new Set(enabledLibraries.map((library) => library.id));
    for (const [libraryId, current] of this.watchers) {
      const library = enabledLibraries.find((candidate) => candidate.id === libraryId);
      if (!enabledIds.has(libraryId) || library?.rootPath !== current.rootPath) await this.remove(libraryId);
    }
    for (const library of enabledLibraries) {
      if (this.watchers.has(library.id)) continue;
      try {
        const watcher = this.watchFactory(library.rootPath);
        const changed = (path: string) => { if (VIDEO_EXTENSIONS.has(extname(path).toLowerCase())) this.schedule(library.id); };
        watcher.on('add', changed).on('change', changed).on('unlink', changed)
          .on('error', (error) => this.logger.error(error, `library watcher error: ${library.name}`));
        this.watchers.set(library.id, { rootPath: library.rootPath, watcher });
      } catch (error) {
        this.logger.error(error, `unable to watch library: ${library.name}`);
      }
    }
  }

  async stop(): Promise<void> {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    await Promise.allSettled([...this.watchers.values()].map(({ watcher }) => watcher.close()));
    this.watchers.clear();
  }

  private async remove(libraryId: string): Promise<void> {
    const timer = this.timers.get(libraryId);
    if (timer) clearTimeout(timer);
    this.timers.delete(libraryId);
    const current = this.watchers.get(libraryId);
    this.watchers.delete(libraryId);
    if (current) await current.watcher.close().catch((error: unknown) => this.logger.error(error, 'unable to stop library watcher'));
  }

  private schedule(libraryId: string): void {
    const previous = this.timers.get(libraryId);
    if (previous) clearTimeout(previous);
    this.timers.set(libraryId, setTimeout(() => {
      this.timers.delete(libraryId);
      void this.scanner.reconcileLibrary(libraryId)
        .then(() => this.logger.info({ libraryId }, 'library filesystem changes reconciled'))
        .catch((error: unknown) => this.logger.error(error, 'library filesystem reconciliation failed'));
    }, this.debounceMs));
  }
}
