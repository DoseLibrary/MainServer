import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** A hand-rolled stand-in for the Cast sender SDK: just enough surface to drive the module. */
function fakeSdk() {
  const listeners: Record<string, Array<(event: { castState?: string; field?: string }) => void>> = {};
  const session = {
    loadMedia: vi.fn<(request: object) => Promise<void>>(async () => undefined),
    getCastDevice: () => ({ friendlyName: 'Living Room' }),
    getMediaSession: () => mediaSession,
  };
  const mediaSession = { editTracksInfo: vi.fn((_request: unknown, ok: () => void) => ok()) };
  const context = {
    setOptions: vi.fn(),
    addEventListener: (type: string, fn: (event: { castState?: string }) => void) => { (listeners[type] ??= []).push(fn); },
    getCurrentSession: vi.fn(() => session),
    requestSession: vi.fn(async () => undefined),
    endSession: vi.fn(),
  };
  const player = { isConnected: true, isMediaLoaded: true, currentTime: 0, duration: 0, isPaused: false, playerState: 'PLAYING', volumeLevel: 1, isMuted: false };
  const controller = { playOrPause: vi.fn(), seek: vi.fn(), setVolumeLevel: vi.fn(), muteOrUnmute: vi.fn(), stop: vi.fn(), addEventListener: (type: string, fn: () => void) => { (listeners[type] ??= []).push(fn); } };
  class Track { trackContentId?: string; trackContentType?: string; subtype?: string; name?: string; language?: string; constructor(public trackId: number, public type: string) {} }
  class MediaInfo { metadata?: unknown; tracks?: Track[]; constructor(public contentId: string, public contentType: string) {} }
  class LoadRequest { currentTime?: number; autoplay?: boolean; activeTrackIds?: number[]; constructor(public media: MediaInfo) {} }
  class EditTracksInfoRequest { constructor(public activeTrackIds: number[]) {} }
  const emit = (type: string, event: object = {}) => listeners[type]?.forEach((fn) => fn(event));
  return {
    player, controller, session, mediaSession, context, emit,
    cast: {
      framework: {
        CastContext: { getInstance: () => context },
        CastContextEventType: { CAST_STATE_CHANGED: 'caststatechanged' },
        CastState: { NO_DEVICES_AVAILABLE: 'NO_DEVICES_AVAILABLE', CONNECTED: 'CONNECTED', CONNECTING: 'CONNECTING', NOT_CONNECTED: 'NOT_CONNECTED' },
        RemotePlayer: function RemotePlayer() { return player; } as unknown as new () => typeof player,
        RemotePlayerController: function RemotePlayerController() { return controller; } as unknown as new (p: unknown) => typeof controller,
        RemotePlayerEventType: { ANY_CHANGE: 'anyChanged' },
      },
    },
    chrome: {
      cast: {
        AutoJoinPolicy: { ORIGIN_SCOPED: 'origin_scoped' },
        Image: class { constructor(public url: string) {} },
        media: {
          DEFAULT_MEDIA_RECEIVER_APP_ID: 'CC1AD845',
          MediaInfo, GenericMediaMetadata: class { title?: string; images?: unknown[] }, LoadRequest, EditTracksInfoRequest, Track,
          TrackType: { TEXT: 'TEXT' }, TextTrackType: { SUBTITLES: 'SUBTITLES' },
        },
      },
    },
  };
}

describe('google-cast remote control', () => {
  let sdk: ReturnType<typeof fakeSdk>;
  let cast: typeof import('./google-cast');

  beforeEach(async () => {
    vi.resetModules();
    sdk = fakeSdk();
    Object.assign(window, { cast: sdk.cast, chrome: sdk.chrome });
    cast = await import('./google-cast');
    window.dispatchEvent(new Event('dose-cast-api'));
  });
  afterEach(() => { delete (window as { cast?: unknown }).cast; delete (window as { chrome?: unknown }).chrome; });

  it('loads media with subtitle tracks and the chosen one active', async () => {
    await cast.castMedia({ src: 'https://dose.local/api/v1/cast/abc/stream', contentType: 'video/mp4', title: 'Heat', currentTime: 42,
      tracks: [{ id: 1, src: 'https://dose.local/api/v1/cast/abc/subtitles/s1', label: 'English', language: 'en' }], activeTrackId: 1 });
    const request = sdk.session.loadMedia.mock.calls[0]![0] as unknown as { media: { tracks?: Array<{ trackId: number; trackContentId: string; type: string; subtype: string }> }; activeTrackIds?: number[]; currentTime?: number };
    expect(request.currentTime).toBe(42);
    expect(request.activeTrackIds).toEqual([1]);
    expect(request.media.tracks).toEqual([expect.objectContaining({ trackId: 1, trackContentId: 'https://dose.local/api/v1/cast/abc/subtitles/s1', type: 'TEXT', subtype: 'SUBTITLES' })]);
  });

  it('mirrors the receiver state to subscribers, including the device name', () => {
    const seen: unknown[] = [];
    cast.subscribeToRemote((status) => seen.push(status));
    Object.assign(sdk.player, { currentTime: 100, duration: 200, isPaused: true, playerState: 'PAUSED' });
    sdk.emit('anyChanged');
    expect(seen[seen.length - 1]).toMatchObject({ connected: true, mediaLoaded: true, currentTime: 100, duration: 200, paused: true, ended: false, deviceName: 'Living Room' });
  });

  it('drives play, seek, volume and subtitle switches through the receiver', () => {
    cast.remote.playOrPause();
    expect(sdk.controller.playOrPause).toHaveBeenCalled();
    cast.remote.seek(75);
    expect(sdk.player.currentTime).toBe(75);
    expect(sdk.controller.seek).toHaveBeenCalled();
    cast.remote.setVolume(0.4);
    expect(sdk.player.volumeLevel).toBe(0.4);
    expect(sdk.controller.setVolumeLevel).toHaveBeenCalled();
    cast.remote.selectTrack(2);
    expect(sdk.mediaSession.editTracksInfo.mock.calls[0]![0]).toEqual({ activeTrackIds: [2] });
    cast.remote.selectTrack(null);
    expect(sdk.mediaSession.editTracksInfo.mock.calls[1]![0]).toEqual({ activeTrackIds: [] });
  });

  it('remembers where the receiver was when the session drops, so local playback can pick up', () => {
    Object.assign(sdk.player, { currentTime: 321, isConnected: true });
    sdk.emit('anyChanged');
    Object.assign(sdk.player, { isConnected: false, currentTime: 0 });
    sdk.emit('anyChanged');
    expect(cast.lastRemotePosition()).toBe(321);
  });

  it('ends the session on stop and tells the receiver to stop too', () => {
    cast.remote.stop();
    expect(sdk.context.endSession).toHaveBeenCalledWith(true);
  });
});
