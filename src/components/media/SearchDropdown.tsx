import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SearchResultItem {
  id: string;
  title: string;
  /** Release year, such as `2010`. */
  year?: number | string;
  /** Runtime for movies (`2h 28m`) or season/episode count for shows (`3 seasons`). */
  meta?: string;
  /** Local poster thumbnail served by the content server (offline-first, small size). */
  posterSrc?: string;
  /** Quality tag rendered on the right, such as `4K` or `HDR`. */
  badge?: ReactNode;
  href?: string;
  onSelect?: (item: SearchResultItem) => void;
}

export interface SearchResultGroup {
  id: string;
  /** Section header, such as `Movies` or `Shows`. */
  label: string;
  items: readonly SearchResultItem[];
}

export interface SearchDropdownProps {
  query: string;
  onQueryChange: (query: string) => void;
  groups: readonly SearchResultGroup[];
  loading?: boolean;
  placeholder?: string;
  emptyMessage?: string;
  className?: string;
}

interface FlatItem {
  item: SearchResultItem;
  /** Index within the flattened, keyboard-navigable list. */
  index: number;
}

function PosterThumb({ src, title }: { src?: string; title: string }) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>(src ? 'loading' : 'error');
  return (
    <div className="relative h-[3.75rem] w-10 shrink-0 overflow-hidden rounded bg-muted">
      {src && status !== 'error' && (
        <img
          src={src}
          alt=""
          className={cn('h-full w-full object-cover transition-opacity duration-200', status === 'loaded' ? 'opacity-100' : 'opacity-0')}
          onLoad={() => setStatus('loaded')}
          onError={() => setStatus('error')}
        />
      )}
      {status === 'error' && (
        <div aria-hidden="true" className="flex h-full w-full items-center justify-center bg-muted p-1 text-center text-[9px] font-medium leading-tight text-muted-foreground">
          {title}
        </div>
      )}
    </div>
  );
}

export function SearchDropdown({
  query,
  onQueryChange,
  groups,
  loading = false,
  placeholder = 'Search movies and shows',
  emptyMessage = 'No results found',
  className,
}: SearchDropdownProps) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const flat = useMemo<FlatItem[]>(() => {
    let index = 0;
    return groups.flatMap((group) => group.items.map((item) => ({ item, index: index++ })));
  }, [groups]);

  const hasResults = flat.length > 0;
  const showPanel = open && query.trim().length > 0;
  // Ignore a stale highlight if the result set shrank since the last keypress.
  const safeActiveIndex = activeIndex < flat.length ? activeIndex : -1;

  // Close when focus leaves the whole widget.
  useEffect(() => {
    if (!showPanel) return;
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [showPanel]);

  function selectItem(item: SearchResultItem) {
    item.onSelect?.(item);
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!showPanel || !hasResults) {
      if (event.key === 'ArrowDown') setOpen(true);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((safeActiveIndex + 1) % flat.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(safeActiveIndex <= 0 ? flat.length - 1 : safeActiveIndex - 1);
    } else if (event.key === 'Enter' && safeActiveIndex >= 0) {
      event.preventDefault();
      const active = flat[safeActiveIndex];
      if (active) {
        if (active.item.href) {
          window.location.assign(active.item.href);
        }
        selectItem(active.item);
      }
    }
  }

  const activeId = safeActiveIndex >= 0 ? `${listboxId}-option-${safeActiveIndex}` : undefined;

  return (
    <div ref={rootRef} className={cn('relative w-full max-w-md', className)}>
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listboxId}
          aria-activedescendant={activeId}
          aria-autocomplete="list"
          autoComplete="off"
          value={query}
          placeholder={placeholder}
          onChange={(event) => {
            onQueryChange(event.target.value);
            setActiveIndex(-1);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="flex h-10 w-full rounded-md border border-input bg-transparent pl-9 pr-3 py-2 text-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        />
      </div>

      {showPanel && (
        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-lg border border-input bg-background shadow-xl shadow-black/40">
          {loading && (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">Searching…</div>
          )}

          {!loading && !hasResults && (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">{emptyMessage}</div>
          )}

          {!loading && hasResults && (
            <ul id={listboxId} role="listbox" className="max-h-96 overflow-y-auto py-1">
              {groups.map((group) => {
                if (group.items.length === 0) return null;
                return (
                  <li key={group.id} role="presentation">
                    <div className="px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {group.label}
                    </div>
                    <ul role="presentation">
                      {group.items.map((item) => {
                        const flatEntry = flat.find((entry) => entry.item === item);
                        const index = flatEntry ? flatEntry.index : -1;
                        const isActive = index === safeActiveIndex;
                        const optionId = `${listboxId}-option-${index}`;
                        const content = (
                          <>
                            <PosterThumb src={item.posterSrc} title={item.title} />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium text-foreground">{item.title}</div>
                              {(item.year != null || item.meta) && (
                                <div className="truncate text-xs text-muted-foreground">
                                  {item.year != null && <span>{item.year}</span>}
                                  {item.year != null && item.meta && <span className="px-1">·</span>}
                                  {item.meta && <span>{item.meta}</span>}
                                </div>
                              )}
                            </div>
                            {item.badge != null && (
                              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                                {item.badge}
                              </span>
                            )}
                          </>
                        );
                        const rowClass = cn(
                          'flex w-full items-center gap-3 px-4 py-2 text-left transition-colors',
                          isActive ? 'bg-accent' : 'hover:bg-accent/60',
                        );
                        return (
                          <li key={item.id} role="presentation">
                            {item.href ? (
                              <a
                                id={optionId}
                                role="option"
                                aria-selected={isActive}
                                href={item.href}
                                onMouseEnter={() => setActiveIndex(index)}
                                onClick={() => selectItem(item)}
                                className={rowClass}
                              >
                                {content}
                              </a>
                            ) : (
                              <button
                                id={optionId}
                                role="option"
                                aria-selected={isActive}
                                type="button"
                                onMouseEnter={() => setActiveIndex(index)}
                                onClick={() => selectItem(item)}
                                className={rowClass}
                              >
                                {content}
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
