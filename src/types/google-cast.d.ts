interface Window {
  cast?: {
    framework: {
      CastContext: { getInstance(): CastContext };
      CastContextEventType: { CAST_STATE_CHANGED: string };
      CastState: { NO_DEVICES_AVAILABLE: string; CONNECTED: string; CONNECTING: string; NOT_CONNECTED?: string };
      RemotePlayer: new () => RemotePlayer;
      RemotePlayerController: new (player: RemotePlayer) => RemotePlayerController;
      RemotePlayerEventType: { ANY_CHANGE: string };
    };
  };
  chrome?: {
    cast: {
      AutoJoinPolicy: { ORIGIN_SCOPED: string };
      Image: new (url: string) => { url: string };
      media: {
        DEFAULT_MEDIA_RECEIVER_APP_ID: string;
        MediaInfo: new (contentId: string, contentType: string) => CastMediaInfo;
        GenericMediaMetadata: new () => { title?: string; images?: Array<{ url: string }> };
        LoadRequest: new (media: object) => { currentTime?: number; autoplay?: boolean; activeTrackIds?: number[] };
        EditTracksInfoRequest: new (activeTrackIds: number[]) => object;
        Track: new (trackId: number, type: string) => CastTrackInfo;
        TrackType: { TEXT: string };
        TextTrackType: { SUBTITLES: string };
      };
    };
  };
}

interface CastMediaInfo {
  metadata?: { title?: string; images?: Array<{ url: string }> };
  tracks?: CastTrackInfo[];
}

interface CastTrackInfo {
  trackId: number;
  type: string;
  trackContentId?: string;
  trackContentType?: string;
  subtype?: string;
  name?: string;
  language?: string;
}

interface CastContext {
  setOptions(options: { receiverApplicationId: string; autoJoinPolicy: string }): void;
  addEventListener(type: string, listener: (event: { castState: string }) => void): void;
  getCurrentSession(): CastSession | null;
  requestSession(): Promise<void>;
  endSession(stopCasting: boolean): void;
}

interface CastSession {
  loadMedia(request: object): Promise<void>;
  getCastDevice(): { friendlyName?: string };
  getMediaSession(): { editTracksInfo(request: object, success: () => void, error: (reason: unknown) => void): void } | null;
}

/** The SDK's mirror of the receiver; fields update in place before ANY_CHANGE fires. */
interface RemotePlayer {
  isConnected: boolean;
  isMediaLoaded: boolean;
  currentTime: number;
  duration: number;
  isPaused: boolean;
  playerState: string | null;
  volumeLevel: number;
  isMuted: boolean;
}

interface RemotePlayerController {
  addEventListener(type: string, listener: () => void): void;
  playOrPause(): void;
  seek(): void;
  setVolumeLevel(): void;
  muteOrUnmute(): void;
  stop(): void;
}
