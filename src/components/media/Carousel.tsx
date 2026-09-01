import {
  Children,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CarouselProps<T = never> {
  /** Accessible name for the carousel region. */
  label: string;
  /** Optional visible title. */
  heading?: ReactNode;
  /** Optional control rendered on the heading row, beside the scroll buttons. */
  headingAction?: ReactNode;
  /** Content supplied directly. */
  children?: ReactNode;
  /** Typed data to render as carousel content. */
  items?: readonly T[];
  /** Renders an item when `items` is supplied. */
  renderItem?: (item: T, index: number) => ReactNode;
  /** Returns a stable React key for an item. */
  getItemKey?: (item: T, index: number) => React.Key;
  className?: string;
  headingClassName?: string;
  viewportClassName?: string;
  itemClassName?: string;
  previousLabel?: string;
  nextLabel?: string;
}

const EDGE_TOLERANCE = 2;
const SCROLL_FRACTION = 0.8;

export function Carousel<T = never>({
  label,
  heading,
  headingAction,
  children,
  items,
  renderItem,
  getItemKey,
  className,
  headingClassName,
  viewportClassName,
  itemClassName,
  previousLabel = 'Previous items',
  nextLabel = 'Next items',
}: CarouselProps<T>) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const headingId = useId();
  const viewportId = useId();
  const [canScrollPrevious, setCanScrollPrevious] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

  const renderedItems = items && renderItem
    ? items.map((item, index) => ({
        key: getItemKey?.(item, index) ?? index,
        content: renderItem(item, index),
      }))
    : Children.toArray(children).map((content, index) => ({ key: index, content }));

  const updateBoundaries = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const maximumScroll = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    setCanScrollPrevious(viewport.scrollLeft > EDGE_TOLERANCE);
    setCanScrollNext(viewport.scrollLeft < maximumScroll - EDGE_TOLERANCE);
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    updateBoundaries();
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? undefined
      : new ResizeObserver(updateBoundaries);
    resizeObserver?.observe(viewport);

    return () => resizeObserver?.disconnect();
  }, [renderedItems.length, updateBoundaries]);

  // A live update pushes the freshest title in at the head of the row, where a
  // viewer scrolled along would never see it. Growing or re-led rows rewind so
  // what just arrived is what is on screen.
  const leadKey = renderedItems[0]?.key;
  const previous = useRef({ leadKey, count: renderedItems.length });
  useEffect(() => {
    const viewport = viewportRef.current;
    const grew = renderedItems.length > previous.current.count;
    const reled = leadKey !== previous.current.leadKey;
    previous.current = { leadKey, count: renderedItems.length };
    if (!viewport || (!grew && !reled) || viewport.scrollLeft === 0) return;
    // jsdom and older engines have no smooth scroll; the jump still rewinds.
    if (viewport.scrollTo) viewport.scrollTo({ left: 0, behavior: 'smooth' });
    else viewport.scrollLeft = 0;
  }, [leadKey, renderedItems.length]);

  const scroll = (direction: -1 | 1) => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    viewport.scrollBy({
      left: direction * viewport.clientWidth * SCROLL_FRACTION,
      behavior: 'smooth',
    });
  };

  const hasContent = renderedItems.length > 0;

  return (
    <section
      aria-label={heading ? undefined : label}
      aria-labelledby={heading ? headingId : undefined}
      className={cn('w-full', className)}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        {heading ? (
          <h2 id={headingId} className={cn('text-xl font-semibold', headingClassName)}>
            {heading}
          </h2>
        ) : <span />}

        <div className="flex shrink-0 items-center gap-2">
          {headingAction}
          {hasContent && (
            <>
            <button
              type="button"
              aria-label={previousLabel}
              aria-controls={viewportId}
              disabled={!canScrollPrevious}
              onClick={() => scroll(-1)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border bg-background text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft aria-hidden="true" className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label={nextLabel}
              aria-controls={viewportId}
              disabled={!canScrollNext}
              onClick={() => scroll(1)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border bg-background text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight aria-hidden="true" className="h-5 w-5" />
            </button>
            </>
          )}
        </div>
      </div>

      {hasContent && (
        <div
          id={viewportId}
          ref={viewportRef}
          role="list"
          onScroll={updateBoundaries}
          className={cn(
            'no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain scroll-smooth pb-2 sm:gap-4',
            viewportClassName,
          )}
        >
          {renderedItems.map(({ key, content }) => (
            <div
              key={key}
              role="listitem"
              className={cn('min-w-0 shrink-0 snap-start', itemClassName)}
            >
              {content}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
