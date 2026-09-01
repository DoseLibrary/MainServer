import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VideoPlayer } from './VideoPlayer';

const POSTER = '/api/v1/images/backdrop.jpg';

const video = () => document.querySelector('video') as HTMLVideoElement;
/** The full-frame play affordance, as distinct from the one in the control bar. */
const playOverlay = () => document.querySelector('button.inset-0[aria-label="Play"]');

/** The element's own signal that a frame is decoded and playback is running. */
function beginPlayback(element: HTMLVideoElement) {
  fireEvent(element, new Event('loadeddata'));
  fireEvent(element, new Event('playing'));
  fireEvent(element, new Event('play'));
}

describe('VideoPlayer buffering', () => {
  it('spins instead of offering play while an automatic start is in flight', () => {
    render(<VideoPlayer src="/stream.mp4" poster={POSTER} autoPlay />);

    expect(screen.getByLabelText('Buffering')).toBeInTheDocument();
    expect(playOverlay()).toBeNull();

    beginPlayback(video());
    expect(screen.queryByLabelText('Buffering')).not.toBeInTheDocument();
  });

  it('offers play when nothing is starting by itself', () => {
    render(<VideoPlayer src="/stream.mp4" poster={POSTER} />);
    expect(playOverlay()).not.toBeNull();
  });

  it('covers a seek with black rather than the backdrop once the title has played', () => {
    render(<VideoPlayer src="/stream.mp4" poster={POSTER} autoPlay />);
    const element = video();
    expect(element).toHaveAttribute('poster', POSTER);

    beginPlayback(element);
    // The poster is gone for good: a seek must not flash the backdrop back.
    expect(element).not.toHaveAttribute('poster');

    fireEvent(element, new Event('seeking'));
    const overlay = screen.getByLabelText('Buffering').parentElement;
    expect(overlay?.className).toContain('bg-black');
    expect(playOverlay()).toBeNull();

    fireEvent(element, new Event('seeked'));
    fireEvent(element, new Event('playing'));
    expect(screen.queryByLabelText('Buffering')).not.toBeInTheDocument();
  });

  it('spins over the frozen frame when a playing stream stalls', () => {
    render(<VideoPlayer src="/stream.mp4" poster={POSTER} autoPlay />);
    const element = video();
    beginPlayback(element);

    fireEvent(element, new Event('waiting'));
    const overlay = screen.getByLabelText('Buffering').parentElement;
    // A decoded frame is still on screen, so the scrim only dims it.
    expect(overlay?.className).toContain('bg-black/40');
  });

  it('shows the play button once the browser refuses an automatic start', () => {
    render(<VideoPlayer src="/stream.mp4" poster={POSTER} autoPlay />);
    const element = video();
    // A viewer who presses pause during the attempt has ended it themselves.
    fireEvent.click(element);
    expect(playOverlay()).not.toBeNull();
  });
});
