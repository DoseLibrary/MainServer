interface Window {
  cast?: {
    framework: {
      CastContext: { getInstance(): CastContext };
      CastContextEventType: { CAST_STATE_CHANGED: string };
      CastState: { NO_DEVICES_AVAILABLE: string; CONNECTED: string; CONNECTING: string };
    };
  };
  chrome?: {
    cast: {
      AutoJoinPolicy: { ORIGIN_SCOPED: string };
      Image: new (url: string) => { url: string };
      media: {
        DEFAULT_MEDIA_RECEIVER_APP_ID: string;
        MediaInfo: new (contentId: string, contentType: string) => { metadata?: { title?: string; images?: Array<{ url: string }> } };
        GenericMediaMetadata: new () => { title?: string; images?: Array<{ url: string }> };
        LoadRequest: new (media: object) => { currentTime?: number; autoplay?: boolean };
      };
    };
  };
}

interface CastContext {
  setOptions(options: { receiverApplicationId: string; autoJoinPolicy: string }): void;
  addEventListener(type: string, listener: (event: { castState: string }) => void): void;
  getCurrentSession(): CastSession | null;
  requestSession(): Promise<void>;
}

interface CastSession { loadMedia(request: object): Promise<void> }
