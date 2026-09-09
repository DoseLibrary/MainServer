import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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

describe('VideoPlayer pointer gestures', () => {
  it('enters fullscreen on double-click without toggling playback', () => {
    vi.useFakeTimers();
    try {
      const { container: root } = render(<VideoPlayer src="/stream.mp4" poster={POSTER} />);
      const element = root.querySelector('video') as HTMLVideoElement;
      const play = vi.spyOn(element, 'play').mockResolvedValue();
      const pause = vi.spyOn(element, 'pause').mockImplementation(() => {});
      const container = element.parentElement as HTMLElement;
      const requestFullscreen = vi.fn().mockResolvedValue(undefined);
      container.requestFullscreen = requestFullscreen;

      fireEvent.click(element);
      fireEvent.click(element);
      fireEvent.doubleClick(element);
      vi.runAllTimers();

      expect(requestFullscreen).toHaveBeenCalledTimes(1);
    expect(play).not.toHaveBeenCalled();
      expect(pause).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it('still toggles playback on a lone click', () => {
    vi.useFakeTimers();
    try {
      const { container: root } = render(<VideoPlayer src="/stream.mp4" poster={POSTER} />);
      const element = root.querySelector('video') as HTMLVideoElement;
      const play = vi.spyOn(element, 'play').mockResolvedValue();

      fireEvent.click(element);
      vi.runAllTimers();

      expect(play).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
});

describe('VideoPlayer while casting', () => {
  it('drives the receiver from the controls and resumes locally where the receiver stopped', async () => {
    const castModule = await import('@/lib/google-cast');
    let castListener: ((state: import('@/lib/google-cast').CastState) => void) | undefined;
    let remoteListener: ((status: import('@/lib/google-cast').RemoteStatus) => void) | undefined;
    vi.spyOn(castModule, 'subscribeToCast').mockImplementation((listener) => { castListener = listener; listener('available'); return () => undefined; });
    vi.spyOn(castModule, 'subscribeToRemote').mockImplementation((listener) => { remoteListener = listener; return () => undefined; });
    const playOrPause = vi.spyOn(castModule.remote, 'playOrPause').mockImplementation(() => undefined);
    const seek = vi.spyOn(castModule.remote, 'seek').mockImplementation(() => undefined);
    vi.spyOn(castModule, 'lastRemotePosition').mockReturnValue(100);

    const { container: root } = render(<VideoPlayer src="/stream.mp4" poster={POSTER} castSrc="https://dose.local/api/v1/cast/abc/stream" title="Heat" />);
    const element = root.querySelector('video') as HTMLVideoElement;
    // The element's play/pause are shared mocks from the test setup, so calls
    // from earlier tests are dropped before this one starts counting.
    const play = vi.spyOn(element, 'play').mockResolvedValue();
    const pause = vi.spyOn(element, 'pause').mockImplementation(() => {});
    play.mockClear(); pause.mockClear();

    act(() => {
      castListener?.('connected');
      remoteListener?.({ connected: true, mediaLoaded: true, currentTime: 100, duration: 200, paused: true, ended: false, volume: 1, muted: false, deviceName: 'Living Room' });
    });
    expect(pause).toHaveBeenCalled();
    expect(screen.getByText('Casting to Living Room')).toBeInTheDocument();
    expect(root.textContent).toContain('1:40');
    expect(root.textContent).toContain('3:20');

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(playOrPause).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Forward 10 seconds' }));
    expect(seek).toHaveBeenCalledWith(110);
    expect(play).not.toHaveBeenCalled();

    act(() => { castListener?.('available'); });
    expect(element.currentTime).toBe(100);
    expect(play).toHaveBeenCalled();
  });
});
