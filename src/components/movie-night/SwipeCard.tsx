import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { MovieNightCard } from '@/lib/api';
import { MovieCardFace } from './MovieCardFace';

export type SwipeDirection = 'left' | 'right' | 'up';
export interface SwipeCardHandle { fly(direction: SwipeDirection): void }

const ROTATION_PER_PX = 0.08;
const MAX_ROTATION = 18;
const THRESHOLD_RATIO = 0.35;
const VELOCITY_THRESHOLD = 0.5; // px per ms
const FLY_DISTANCE = 3; // × card width

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

interface Props {
  card: MovieNightCard;
  onSwipe: (direction: SwipeDirection) => void;
  interactive?: boolean;
  /** 0 = top card, 1 and 2 peek from behind. */
  depth?: 0 | 1 | 2;
  /** Play the return animation from this side (undo). */
  entering?: SwipeDirection;
}

/**
 * One card in the deck. Held from its bottom edge: it tilts with the drag,
 * stamps YES / NOPE as it goes, and either flies off or springs back. All
 * motion is a single transform on one element so the phone stays at 60 fps.
 */
export const SwipeCard = forwardRef<SwipeCardHandle, Props>(function SwipeCard({ card, onSwipe, interactive = true, depth = 0, entering }, ref) {
  const el = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startX: number; startY: number; currentX: number; frameX: number; frameT: number; velocity: number } | null>(null);
  const rafId = useRef<number | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState<SwipeDirection | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [entered, setEntered] = useState(!entering);
  const [readyToSlide, setReadyToSlide] = useState(false);

  const width = () => el.current?.offsetWidth || 320;

  useEffect(() => () => { if (rafId.current != null) cancelAnimationFrame(rafId.current); }, []);

  function fly(direction: SwipeDirection) {
    if (leaving) return;
    setDragging(false);
    setLeaving(direction);
    const w = width();
    setOffset(direction === 'up' ? { x: 0, y: -w * 2 } : { x: (direction === 'right' ? 1 : -1) * w * FLY_DISTANCE, y: offset.y });
    if (reducedMotion()) onSwipe(direction);
  }
  useImperativeHandle(ref, () => ({ fly }));

  // Velocity is sampled once per animation frame from the latest pointer
  // position rather than between consecutive pointermove events: pointermove
  // fires far more often than the display refreshes (and, in tests, several
  // in a row with ~0ms between them), so an event-to-event delta is mostly
  // measuring dispatch jitter, not how fast the finger is actually moving.
  function sampleVelocity() {
    const d = drag.current; if (!d) return;
    const now = performance.now();
    const dt = Math.max(1, now - d.frameT);
    d.velocity = (d.currentX - d.frameX) / dt;
    d.frameX = d.currentX; d.frameT = now;
    rafId.current = requestAnimationFrame(sampleVelocity);
  }
  function stopSampling() {
    if (rafId.current != null) cancelAnimationFrame(rafId.current);
    rafId.current = null;
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!interactive || leaving || !event.isPrimary) return;
    const now = performance.now();
    drag.current = { startX: event.clientX, startY: event.clientY, currentX: event.clientX, frameX: event.clientX, frameT: now, velocity: 0 };
    el.current?.setPointerCapture?.(event.pointerId);
    setDragging(true);
    stopSampling();
    rafId.current = requestAnimationFrame(sampleVelocity);
  }
  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current; if (!d) return;
    d.currentX = event.clientX;
    setOffset({ x: event.clientX - d.startX, y: (event.clientY - d.startY) * 0.4 });
  }
  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current; if (!d) return;
    drag.current = null;
    stopSampling();
    el.current?.releasePointerCapture?.(event.pointerId);
    const dx = event.clientX - d.startX;
    const past = Math.abs(dx) > width() * THRESHOLD_RATIO || Math.abs(d.velocity) > VELOCITY_THRESHOLD;
    if (past) fly(dx > 0 || (Math.abs(dx) <= width() * THRESHOLD_RATIO && d.velocity > 0) ? 'right' : 'left');
    else { setDragging(false); setOffset({ x: 0, y: 0 }); }
  }
  function onTransitionEnd() {
    if (leaving) onSwipe(leaving);
    if (!entered) setEntered(true);
  }

  // Undo: place the card off-screen on the side it left from (no transition,
  // committed before the browser paints), then release it on the next frame
  // so it slides in with the normal spring transition.
  useLayoutEffect(() => {
    if (!entering) return;
    const w = width();
    setOffset(entering === 'up' ? { x: 0, y: -w * 2 } : { x: (entering === 'right' ? 1 : -1) * w * FLY_DISTANCE, y: 0 });
    const raf = requestAnimationFrame(() => {
      setOffset({ x: 0, y: 0 });
      setReadyToSlide(true);
    });
    return () => cancelAnimationFrame(raf);
    // Only re-run if the side we entered from changes; not on every offset change.
  }, [entering]);

  const rotation = Math.max(-MAX_ROTATION, Math.min(MAX_ROTATION, offset.x * ROTATION_PER_PX)) || 0;
  const progress = Math.min(1, Math.abs(offset.x) / (width() * THRESHOLD_RATIO));
  const stackTransform = depth === 0 ? '' : ` scale(${1 - depth * 0.05}) translateY(${depth * 12}px)`;
  const transform = `translate3d(${offset.x}px, ${offset.y}px, 0) rotate(${rotation}deg)${stackTransform}`;
  const transition = dragging ? 'none'
    : leaving ? 'transform 350ms cubic-bezier(.2,.8,.2,1), opacity 350ms'
      : entering && !entered && !readyToSlide ? 'none'
        : 'transform 300ms cubic-bezier(.34,1.56,.64,1)';

  return (
    <div ref={el} data-testid="swipe-card" data-depth={depth} data-leaving={leaving ?? undefined}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      onTransitionEnd={onTransitionEnd}
      style={{ transform, transition, transformOrigin: '50% 100%', touchAction: 'none', zIndex: 10 - depth, opacity: leaving && reducedMotion() ? 0 : 1 }}
      className="absolute inset-0 select-none will-change-transform">
      <MovieCardFace card={card} expanded={expanded} onToggleExpand={() => setExpanded((v) => !v)} />
      {depth === 0 && <>
        <span aria-hidden={progress === 0 || offset.x <= 0} style={{ opacity: offset.x > 0 ? progress : 0, transform: 'rotate(-12deg)' }}
          className="pointer-events-none absolute left-6 top-8 rounded-lg border-4 border-emerald-400 px-3 py-1 text-3xl font-black tracking-widest text-emerald-400">YES</span>
        <span aria-hidden={progress === 0 || offset.x >= 0} style={{ opacity: offset.x < 0 ? progress : 0, transform: 'rotate(12deg)' }}
          className="pointer-events-none absolute right-6 top-8 rounded-lg border-4 border-rose-500 px-3 py-1 text-3xl font-black tracking-widest text-rose-500">NOPE</span>
      </>}
    </div>
  );
});
