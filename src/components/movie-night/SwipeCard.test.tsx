import { act, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SwipeCard, type SwipeCardHandle } from './SwipeCard';

const card = { id: 'a', title: 'Alpha', year: 2001, rating: 8.1, overview: 'First film', runtimeMinutes: 90, posterUrl: '/api/v1/images/a.jpg' };

function drag(el: HTMLElement, dx: number, steps = 3) {
  fireEvent.pointerDown(el, { pointerId: 1, clientX: 200, clientY: 300, isPrimary: true });
  for (let i = 1; i <= steps; i++) fireEvent.pointerMove(el, { pointerId: 1, clientX: 200 + (dx * i) / steps, clientY: 300 });
}

let nowSpy: ReturnType<typeof vi.spyOn> | undefined;

// Pins performance.now() to a value we control and step explicitly before
// each dispatch. React itself calls performance.now() many times per render
// for its own scheduling (act(), the concurrent scheduler, ...), so a
// sequential mockReturnValueOnce queue gets consumed by that noise rather
// than by the component's own reads — pinning to a single current value and
// advancing it right before each fireEvent sidesteps that entirely: every
// call made during that dispatch (ours and React's) sees the same value, so
// the component's own sample still lands on the value we intended.
function pinNow() {
  const state = { value: 0 };
  nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => state.value);
  return (t: number) => { state.value = t; };
}

/** Like `drag`, but pins performance.now() to `times[i]` before dispatching
 * pointerdown (times[0]) and each pointermove step (times[1..]). */
function dragTimed(el: HTMLElement, dx: number, times: number[], steps = 3) {
  const setNow = pinNow();
  setNow(times[0]);
  fireEvent.pointerDown(el, { pointerId: 1, clientX: 200, clientY: 300, isPrimary: true });
  for (let i = 1; i <= steps; i++) {
    setNow(times[i]);
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 200 + (dx * i) / steps, clientY: 300 });
  }
}

describe('SwipeCard', () => {
  beforeAll(() => {
    // jsdom has no layout; give the card a width so thresholds are computable.
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 300 });
    HTMLElement.prototype.setPointerCapture = vi.fn();
    HTMLElement.prototype.releasePointerCapture = vi.fn();
  });

  afterEach(() => {
    nowSpy?.mockRestore();
    nowSpy = undefined;
  });

  it('shows the title, meta line and rating', () => {
    render(<SwipeCard card={card} onSwipe={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Alpha' })).toBeInTheDocument();
    expect(screen.getByText(/2001/)).toBeInTheDocument();
    expect(screen.getByText(/8\.1/)).toBeInTheDocument();
    expect(screen.getByText(/1h 30m/)).toBeInTheDocument();
  });

  it('rotates with the drag and springs back below the threshold', () => {
    const onSwipe = vi.fn();
    render(<SwipeCard card={card} onSwipe={onSwipe} />);
    const el = screen.getByTestId('swipe-card');
    // A slow drag: 60px spread across 600ms (0.1 px/ms average), well under
    // VELOCITY_THRESHOLD — pinned so the outcome never depends on how fast
    // the test happens to execute on the machine running it.
    dragTimed(el, 60, [0, 200, 400, 600]);
    expect(el.style.transform).toMatch(/translate3d\(60px, 0px, 0\) rotate\(4\.8deg\)/);
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 260, clientY: 300 });
    expect(el.style.transform).toMatch(/translate3d\(0px, 0px, 0\) rotate\(0deg\)/);
    expect(el.dataset.leaving).toBeUndefined();
    expect(onSwipe).not.toHaveBeenCalled();
  });

  it('flies right on a fast flick even though the drag stayed below the distance threshold', () => {
    const onSwipe = vi.fn();
    render(<SwipeCard card={card} onSwipe={onSwipe} />);
    const el = screen.getByTestId('swipe-card');
    // Same 60px drag, but spread across 30ms (2 px/ms) — a genuine flick.
    dragTimed(el, 60, [0, 10, 20, 30]);
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 260, clientY: 300 });
    expect(el.dataset.leaving).toBe('right');
    expect(onSwipe).not.toHaveBeenCalled();
    fireEvent.transitionEnd(el);
    expect(onSwipe).toHaveBeenCalledWith('right');
  });

  it('flies out past the threshold and reports the direction after the transition', () => {
    const onSwipe = vi.fn();
    render(<SwipeCard card={card} onSwipe={onSwipe} />);
    const el = screen.getByTestId('swipe-card');
    drag(el, -150);
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 50, clientY: 300 });
    expect(el.style.transform).toMatch(/translate3d\(-\d+px/);
    expect(el.dataset.leaving).toBe('left');
    expect(onSwipe).not.toHaveBeenCalled();
    fireEvent.transitionEnd(el);
    expect(onSwipe).toHaveBeenCalledWith('left');
  });

  it('caps the rotation and shows the stamp', () => {
    render(<SwipeCard card={card} onSwipe={vi.fn()} />);
    const el = screen.getByTestId('swipe-card');
    drag(el, 400);
    expect(el.style.transform).toMatch(/rotate\(18deg\)/);
    expect(screen.getByText('YES')).toBeVisible();
  });

  it('can be flown programmatically through the handle', () => {
    const onSwipe = vi.fn();
    const ref = createRef<SwipeCardHandle>();
    render(<SwipeCard ref={ref} card={card} onSwipe={onSwipe} />);
    act(() => ref.current?.fly('up'));
    const el = screen.getByTestId('swipe-card');
    expect(el.dataset.leaving).toBe('up');
    fireEvent.transitionEnd(el);
    expect(onSwipe).toHaveBeenCalledWith('up');
  });

  it('fires onSwipe exactly once under reduced motion, even if a transitionend follows', () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    try {
      const onSwipe = vi.fn();
      const ref = createRef<SwipeCardHandle>();
      render(<SwipeCard ref={ref} card={card} onSwipe={onSwipe} />);
      act(() => ref.current?.fly('right'));
      expect(onSwipe).toHaveBeenCalledTimes(1);
      expect(onSwipe).toHaveBeenCalledWith('right');
      const el = screen.getByTestId('swipe-card');
      expect(el.style.transition).toContain('opacity');
      expect(el.style.transition).not.toContain('transform');
      fireEvent.transitionEnd(el);
      expect(onSwipe).toHaveBeenCalledTimes(1);
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it('springs back on pointer cancel even past the threshold', () => {
    const onSwipe = vi.fn();
    render(<SwipeCard card={card} onSwipe={onSwipe} />);
    const el = screen.getByTestId('swipe-card');
    drag(el, -150);
    fireEvent.pointerCancel(el, { pointerId: 1, clientX: 50, clientY: 300 });
    expect(el.style.transform).toMatch(/translate3d\(0px, 0px, 0\) rotate\(0deg\)/);
    expect(el.dataset.leaving).toBeUndefined();
    expect(onSwipe).not.toHaveBeenCalled();
  });
});
