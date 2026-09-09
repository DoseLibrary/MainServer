export type CastState = 'unavailable' | 'available' | 'connecting' | 'connected';

/** What the receiver is doing, mirrored from the SDK's RemotePlayer. */
export interface RemoteStatus {
  connected: boolean;
  mediaLoaded: boolean;
  currentTime: number;
  duration: number;
  paused: boolean;
  ended: boolean;
  volume: number;
  muted: boolean;
  deviceName?: string;
}

export interface CastTrack {
  /** Stable per-load id the receiver refers back to. */
  id: number;
  /** Absolute, unauthenticated WebVTT URL the receiver can fetch itself. */
  src: string;
  label: string;
  language?: string;
}

let state: CastState = 'unavailable';
let initialized = false;
const listeners = new Set<(next: CastState) => void>();
const remoteListeners = new Set<(status: RemoteStatus) => void>();
let player: RemotePlayer | undefined;
let controller: RemotePlayerController | undefined;
let remoteStatus: RemoteStatus = { connected: false, mediaLoaded: false, currentTime: 0, duration: 0, paused: true, ended: false, volume: 1, muted: false };
// The receiver's position survives the session so a dropped or ended cast can
// hand playback back to the local element at the same spot.
let lastPosition = 0;

function publish(next: CastState) {
  state = next;
  listeners.forEach((listener) => listener(next));
}

function publishRemote() {
  if (!player) return;
  const wasConnected = remoteStatus.connected;
  if (player.isConnected && player.currentTime > 0) lastPosition = player.currentTime;
  const session = window.cast?.framework.CastContext.getInstance().getCurrentSession();
  remoteStatus = {
    connected: player.isConnected,
    mediaLoaded: player.isMediaLoaded,
    currentTime: player.currentTime,
    duration: player.duration,
    paused: player.isPaused,
    ended: player.playerState === 'IDLE' && wasConnected && player.isConnected && !player.isMediaLoaded && lastPosition > 0,
    volume: player.volumeLevel,
    muted: player.isMuted,
    deviceName: player.isConnected ? session?.getCastDevice()?.friendlyName : undefined,
  };
  remoteListeners.forEach((listener) => listener(remoteStatus));
}

function initialize() {
  if (initialized || !window.cast?.framework || !window.chrome?.cast) return;
  initialized = true;
  const framework = window.cast.framework;
  const chromeCast = window.chrome.cast;
  const context = framework.CastContext.getInstance();
  context.setOptions({ receiverApplicationId: chromeCast.media.DEFAULT_MEDIA_RECEIVER_APP_ID, autoJoinPolicy: chromeCast.AutoJoinPolicy.ORIGIN_SCOPED });
  context.addEventListener(framework.CastContextEventType.CAST_STATE_CHANGED, (event) => {
    publish(event.castState === framework.CastState.NO_DEVICES_AVAILABLE ? 'unavailable' : event.castState === framework.CastState.CONNECTED ? 'connected' : event.castState === framework.CastState.CONNECTING ? 'connecting' : 'available');
  });
  player = new framework.RemotePlayer();
  controller = new framework.RemotePlayerController(player);
  controller.addEventListener(framework.RemotePlayerEventType.ANY_CHANGE, publishRemote);
}

if (typeof window !== 'undefined') {
  window.addEventListener('dose-cast-api', initialize);
  queueMicrotask(initialize);
}

export function subscribeToCast(listener: (next: CastState) => void) {
  listeners.add(listener);
  listener(state);
  return () => { listeners.delete(listener); };
}

export function subscribeToRemote(listener: (status: RemoteStatus) => void) {
  remoteListeners.add(listener);
  listener(remoteStatus);
  return () => { remoteListeners.delete(listener); };
}

/** Where the receiver last was, for resuming locally after a cast ends. */
export function lastRemotePosition(): number {
  return lastPosition;
}

export async function castMedia(input: { src: string; contentType: string; title?: string; poster?: string; currentTime: number; tracks?: CastTrack[]; activeTrackId?: number | null }) {
  initialize();
  const context = window.cast?.framework.CastContext.getInstance();
  if (!context || !window.chrome?.cast) throw new Error('Google Cast is unavailable');
  let session = context.getCurrentSession();
  if (!session) {
    await context.requestSession();
    session = context.getCurrentSession();
  }
  if (!session) throw new Error('No Cast session was started');
  const mediaApi = window.chrome.cast.media;
  const media = new mediaApi.MediaInfo(input.src, input.contentType);
  media.metadata = new mediaApi.GenericMediaMetadata();
  media.metadata.title = input.title ?? '';
  if (input.poster) media.metadata.images = [new window.chrome.cast.Image(input.poster)];
  if (input.tracks?.length) {
    media.tracks = input.tracks.map((track) => {
      const info = new mediaApi.Track(track.id, mediaApi.TrackType.TEXT);
      info.trackContentId = track.src;
      info.trackContentType = 'text/vtt';
      info.subtype = mediaApi.TextTrackType.SUBTITLES;
      info.name = track.label;
      info.language = track.language;
      return info;
    });
  }
  const request = new mediaApi.LoadRequest(media);
  request.currentTime = input.currentTime;
  request.autoplay = true;
  if (input.activeTrackId != null) request.activeTrackIds = [input.activeTrackId];
  lastPosition = input.currentTime;
  await session.loadMedia(request);
  publish('connected');
}

/** Controls that act on the receiver rather than the local element. */
export const remote = {
  playOrPause() { controller?.playOrPause(); },
  seek(seconds: number) {
    if (!player || !controller) return;
    player.currentTime = Math.max(0, seconds);
    controller.seek();
  },
  setVolume(level: number) {
    if (!player || !controller) return;
    player.volumeLevel = Math.min(1, Math.max(0, level));
    controller.setVolumeLevel();
  },
  setMuted(muted: boolean) {
    if (!player || !controller || player.isMuted === muted) return;
    controller.muteOrUnmute();
  },
  /** Switches the receiver's subtitle track; null turns subtitles off. */
  selectTrack(id: number | null) {
    const mediaSession = window.cast?.framework.CastContext.getInstance().getCurrentSession()?.getMediaSession();
    const requestApi = window.chrome?.cast.media.EditTracksInfoRequest;
    if (!mediaSession || !requestApi) return;
    mediaSession.editTracksInfo(new requestApi(id == null ? [] : [id]), () => undefined, () => undefined);
  },
  /** Ends the session and stops the receiver; local playback takes over from `lastRemotePosition()`. */
  stop() { window.cast?.framework.CastContext.getInstance().endSession(true); },
};
