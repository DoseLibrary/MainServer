import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MatchOverlay } from './MatchOverlay';
import { SwipeDeck } from './SwipeDeck';

const cards = [{ id: 'a', title: 'Alpha' }, { id: 'b', title: 'Beta' }, { id: 'c', title: 'Gamma' }, { id: 'd', title: 'Delta' }];

describe('SwipeDeck', () => {
  it('stacks the current card and the next two', () => {
    render(<SwipeDeck cards={cards} index={0} onVote={vi.fn()} onUndo={vi.fn()} canUndo={false} />);
    const stack = screen.getAllByTestId('swipe-card');
    expect(stack).toHaveLength(3);
    expect(stack.map((el) => el.dataset.depth)).toEqual(['2', '1', '0']);
    expect(screen.getByRole('heading', { name: 'Alpha' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Delta' })).not.toBeInTheDocument();
  });

  it('buttons fly the top card and report the vote after the transition', () => {
    const onVote = vi.fn();
    render(<SwipeDeck cards={cards} index={0} onVote={onVote} onUndo={vi.fn()} canUndo={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Maybe' }));
    const top = screen.getAllByTestId('swipe-card').find((el) => el.dataset.depth === '0')!;
    expect(top.dataset.leaving).toBe('up');
    fireEvent.transitionEnd(top);
    expect(onVote).toHaveBeenCalledWith(cards[0], 'maybe');
  });

  it('gives the stack a min-height floor so it never collapses to zero', () => {
    render(<SwipeDeck cards={cards} index={0} onVote={vi.fn()} onUndo={vi.fn()} canUndo={false} />);
    expect(screen.getByTestId('swipe-stack').className).toMatch(/min-h-\[/);
  });

  it('enables undo only when allowed and shows the done panel at the end', () => {
    const onUndo = vi.fn();
    const { rerender } = render(<SwipeDeck cards={cards} index={1} onVote={vi.fn()} onUndo={onUndo} canUndo />);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onUndo).toHaveBeenCalled();
    rerender(<SwipeDeck cards={cards} index={4} onVote={vi.fn()} onUndo={onUndo} canUndo={false} />);
    expect(screen.getByTestId('deck-done')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });
});

describe('MatchOverlay', () => {
  it('vibrates when it opens and shows the card', () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate });
    const { rerender } = render(<MatchOverlay card={cards[0]} open={false} />);
    expect(vibrate).not.toHaveBeenCalled();
    rerender(<MatchOverlay card={cards[0]} open />);
    expect(vibrate).toHaveBeenCalledWith([100, 50, 100]);
    expect(screen.getByText("It's a match!")).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Alpha' })).toBeInTheDocument();
  });
});
