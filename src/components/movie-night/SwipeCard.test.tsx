import { act, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SwipeCard, type SwipeCardHandle } from './SwipeCard';

const card = { id: 'a', title: 'Alpha', year: 2001, rating: 8.1, overview: 'First film', runtimeMinutes: 90, posterUrl: '/api/v1/images/a.jpg' };

function drag(el: HTMLElement, dx: number, steps = 3) {
  fireEvent.pointerDown(el, { pointerId: 1, clientX: 200, clientY: 300, isPrimary: true });
  for (let i = 1; i <= steps; i++) fireEvent.pointerMove(el, { pointerId: 1, clientX: 200 + (dx * i) / steps, clientY: 300 });
}

describe('SwipeCard', () => {
  beforeAll(() => {
    // jsdom has no layout; give the card a width so thresholds are computable.
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 300 });
    HTMLElement.prototype.setPointerCapture = vi.fn();
    HTMLElement.prototype.releasePointerCapture = vi.fn();
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
    drag(el, 60);
    expect(el.style.transform).toMatch(/translate3d\(60px, 0px, 0\) rotate\(4\.8deg\)/);
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 260, clientY: 300 });
    expect(el.style.transform).toMatch(/translate3d\(0px, 0px, 0\) rotate\(0deg\)/);
    expect(onSwipe).not.toHaveBeenCalled();
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
});
