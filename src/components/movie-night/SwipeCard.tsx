import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { MovieNightCard } from '@/lib/api';
import { MovieCardFace } from './MovieCardFace';

export type SwipeDirection = 'left' | 'right' | 'up';
export interface SwipeCardHandle { fly(direction: SwipeDirection): void }

const ROTATION_PER_PX = 0.08;
const MAX_ROTATION = 18;
const THRESHOLD_RATIO = 0.35;
const VELOCITY_THRESHOLD = 0.5; // px per ms
const FLY_DISTANCE = 3; // × card width
// pointermove fires far more often than the display refreshes, and under
// test/CI dispatch (or a machine briefly stalling under load) two events can
// land anywhere from ~0ms to tens of ms apart with no relation to a real
// per-frame gap; a short travel (a handful of px, as one drag step normally
// is) divided by a short-but-nonzero interval still reads as an implausible
// velocity, so intervals below this floor are dropped as dispatch jitter
// rather than treated as real finger motion.
const MIN_SAMPLE_DT_MS = 50;
// No deliberate flick — real or synthetic — completes faster than this; used
// as a floor on the down-to-up elapsed time so a near-instant test dispatch
// (or a slow CI machine briefly stalling between events) can't read back as
// an implausibly high velocity. Kept well clear of VELOCITY_THRESHOLD's
// break-even point for a modest drag (e.g. 60px / 300ms = 0.2 px/ms, safely
// under 0.5) so ordinary scheduling jitter can't flip the outcome.
const MIN_FLICK_DURATION_MS = 300;
// A velocity reading only overrides the distance threshold once the finger
// has actually travelled a meaningful distance — otherwise a trivial jitter
// with a fast instantaneous delta could count as a flick.
const MIN_VELOCITY_TRAVEL_PX = 24;

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
  const drag = useRef<{ startX: number; startY: number; downTime: number; lastX: number; lastT: number; velocity: number } | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState<SwipeDirection | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [entered, setEntered] = useState(!entering);
  const [readyToSlide, setReadyToSlide] = useState(false);
  // onSwipe must fire exactly once per card no matter which path gets there:
  // the immediate reduced-motion call, or transitionend for the normal
  // animated fly-out. Both paths check this before calling.
  const fired = useRef(false);

  const width = () => el.current?.offsetWidth || 320;

  function fly(direction: SwipeDirection) {
    if (leaving) return;
    setDragging(false);
    setLeaving(direction);
    const w = width();
    setOffset(direction === 'up' ? { x: 0, y: -w * 2 } : { x: (direction === 'right' ? 1 : -1) * w * FLY_DISTANCE, y: offset.y });
    if (reducedMotion() && !fired.current) {
      fired.current = true;
      onSwipe(direction);
    }
  }
  useImperativeHandle(ref, () => ({ fly }));

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!interactive || leaving || !event.isPrimary) return;
    const now = performance.now();
    drag.current = { startX: event.clientX, startY: event.clientY, downTime: now, lastX: event.clientX, lastT: now, velocity: 0 };
    el.current?.setPointerCapture?.(event.pointerId);
    setDragging(true);
  }
  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current; if (!d) return;
    const now = performance.now();
    const dt = now - d.lastT;
    if (dt >= MIN_SAMPLE_DT_MS) {
      d.velocity = (event.clientX - d.lastX) / dt;
      d.lastX = event.clientX; d.lastT = now;
    }
    setOffset({ x: event.clientX - d.startX, y: (event.clientY - d.startY) * 0.4 });
  }
  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current; if (!d) return;
    drag.current = null;
    el.current?.releasePointerCapture?.(event.pointerId);
    const dx = event.clientX - d.startX;
    // A per-sample velocity can read 0 when the whole flick lands inside one
    // frame (or one synchronous test dispatch); fall back to the average
    // velocity across the whole gesture so a fast, short flick still counts.
    // The elapsed time is floored so a near-instant dispatch can't read back
    // as an implausible velocity, and the fallback only applies once the
    // finger has moved a real distance.
    const elapsed = Math.max(MIN_FLICK_DURATION_MS, performance.now() - d.downTime);
    const overallVelocity = Math.abs(dx) / elapsed;
    // Below the minimum travel, velocity never overrides the distance
    // threshold — not even the raw per-sample reading — so a trivial jitter
    // can't count as a flick.
    const velocity = Math.abs(dx) >= MIN_VELOCITY_TRAVEL_PX ? Math.max(Math.abs(d.velocity), overallVelocity) : 0;
    const past = Math.abs(dx) > width() * THRESHOLD_RATIO || velocity > VELOCITY_THRESHOLD;
    if (past) fly(dx > 0 || (Math.abs(dx) <= width() * THRESHOLD_RATIO && d.velocity > 0) ? 'right' : 'left');
    else { setDragging(false); setOffset({ x: 0, y: 0 }); }
  }
  function onPointerCancel(event: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current; if (!d) return;
    drag.current = null;
    el.current?.releasePointerCapture?.(event.pointerId);
    // An aborted gesture (e.g. the OS takes over for a system gesture) is
    // never a vote — always spring back, regardless of how far it travelled.
    setDragging(false);
    setOffset({ x: 0, y: 0 });
  }
  function onTransitionEnd() {
    if (leaving && !fired.current) {
      fired.current = true;
      onSwipe(leaving);
    }
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
  // Reduced motion replaces motion with an instant cut: no transform
  // transition at all (the offset jumps straight to the fly-out position),
  // and the opacity style below (already 0 while leaving) has nothing to
  // transition either, so no transitionend ever fires for this path.
  const transition = dragging ? 'none'
    : leaving ? (reducedMotion() ? 'none' : 'transform 350ms cubic-bezier(.2,.8,.2,1), opacity 350ms')
      : entering && !entered && !readyToSlide ? 'none'
        : 'transform 300ms cubic-bezier(.34,1.56,.64,1)';

  return (
    <div ref={el} data-testid="swipe-card" data-depth={depth} data-leaving={leaving ?? undefined}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}
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
