import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type TransitionEvent as ReactTransitionEvent } from 'react';
import type { MovieNightCard } from '@/lib/api';
import { MovieCardFace } from './MovieCardFace';

export type SwipeDirection = 'left' | 'right' | 'up';
export interface SwipeCardHandle { fly(direction: SwipeDirection): void }

const ROTATION_PER_PX = 0.08;
const MAX_ROTATION = 18;
const THRESHOLD_RATIO = 0.35;
const VELOCITY_THRESHOLD = 0.5; // px per ms
const FLY_DISTANCE = 3; // × card width
// A rolling window of recent pointer positions, so velocity reflects the
// finger's most recent motion rather than the whole gesture (a slow drag
// that ends in a fast flick should register as a flick).
interface Sample { t: number; x: number }
const MAX_SAMPLES = 8;
const VELOCITY_WINDOW_MS = 100;
// Below this span the two samples are too close together in time for their
// distance to be a meaningful rate — treat velocity as unknown (0) rather
// than let a near-zero denominator blow it up.
const MIN_VELOCITY_SPAN_MS = 16;
// A velocity reading only overrides the distance threshold once the finger
// has actually travelled a meaningful distance — otherwise a trivial jitter
// with a fast instantaneous delta could count as a flick.
const MIN_VELOCITY_TRAVEL_PX = 24;
// transitionend is the normal signal that a card has left; this is the backstop
// for the cases where it never arrives (the element is hidden mid-flight, the
// tab is backgrounded, a zero-duration transition is optimised away). Comfortably
// longer than the 350ms fly-out so it never pre-empts the real event.
const FLY_FALLBACK_MS = 500;

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
  const drag = useRef<{ startX: number; startY: number; samples: Sample[] } | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState<SwipeDirection | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [entered, setEntered] = useState(!entering);
  const [readyToSlide, setReadyToSlide] = useState(false);
  // onSwipe must fire exactly once per card no matter which path gets there:
  // transitionend (the fade under reduced motion, the fly-out otherwise) or the
  // fallback timer. Every path goes through fire().
  const fired = useRef(false);
  const fallback = useRef<ReturnType<typeof setTimeout>>(undefined);

  const width = () => el.current?.offsetWidth || 320;

  function fire(direction: SwipeDirection) {
    if (fired.current) return;
    fired.current = true;
    clearTimeout(fallback.current);
    onSwipe(direction);
  }

  function fly(direction: SwipeDirection) {
    if (leaving) return;
    setDragging(false);
    setLeaving(direction);
    const w = width();
    setOffset(direction === 'up' ? { x: 0, y: -w * 2 } : { x: (direction === 'right' ? 1 : -1) * w * FLY_DISTANCE, y: offset.y });
    // Under reduced motion the card fades rather than flies, and the fade's own
    // transitionend is what reports the swipe — firing synchronously here would
    // unmount the card before anyone saw it go.
    fallback.current = setTimeout(() => fire(direction), FLY_FALLBACK_MS);
  }

  useEffect(() => () => clearTimeout(fallback.current), []);
  useImperativeHandle(ref, () => ({ fly }));

  function pushSample(d: { samples: Sample[] }, x: number) {
    d.samples.push({ t: performance.now(), x });
    if (d.samples.length > MAX_SAMPLES) d.samples.shift();
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!interactive || leaving || !event.isPrimary) return;
    drag.current = { startX: event.clientX, startY: event.clientY, samples: [] };
    pushSample(drag.current, event.clientX);
    el.current?.setPointerCapture?.(event.pointerId);
    setDragging(true);
  }
  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current; if (!d) return;
    pushSample(d, event.clientX);
    setOffset({ x: event.clientX - d.startX, y: (event.clientY - d.startY) * 0.4 });
  }
  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current; if (!d) return;
    drag.current = null;
    el.current?.releasePointerCapture?.(event.pointerId);
    const dx = event.clientX - d.startX;
    // Velocity comes from the most recent samples only (the last
    // VELOCITY_WINDOW_MS of motion), so a drag that slows to a stop after an
    // earlier fast stretch doesn't still read as fast.
    const newest = d.samples[d.samples.length - 1];
    const windowStart = newest.t - VELOCITY_WINDOW_MS;
    const windowed = d.samples.filter((s) => s.t >= windowStart);
    const oldest = windowed[0];
    const span = newest.t - oldest.t;
    const velocity = span >= MIN_VELOCITY_SPAN_MS ? Math.abs(newest.x - oldest.x) / span : 0;
    const velocityPast = Math.abs(dx) >= MIN_VELOCITY_TRAVEL_PX && velocity > VELOCITY_THRESHOLD;
    const past = Math.abs(dx) > width() * THRESHOLD_RATIO || velocityPast;
    if (past) {
      const direction = velocityPast ? (newest.x - oldest.x > 0 ? 'right' : 'left') : (dx > 0 ? 'right' : 'left');
      fly(direction);
    } else { setDragging(false); setOffset({ x: 0, y: 0 }); }
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
  function onTransitionEnd(event: ReactTransitionEvent<HTMLDivElement>) {
    // Only this card's own transitions count — a poster or a stamp finishing its
    // own transition must not be read as the card having left.
    if (event.target !== el.current) return;
    if (leaving) fire(leaving);
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
  // Reduced motion replaces motion with a fade: the offset still jumps
  // straight to the fly-out position (no transform transition), but opacity
  // still transitions to 0 so the card doesn't just vanish. That fade's
  // transitionend reports the swipe, through the same fire-once path as the
  // animated fly-out.
  const transition = dragging ? 'none'
    : leaving ? (reducedMotion() ? 'opacity 350ms' : 'transform 350ms cubic-bezier(.2,.8,.2,1), opacity 350ms')
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
