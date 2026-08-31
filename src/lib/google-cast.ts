export type CastState = 'unavailable' | 'available' | 'connecting' | 'connected';

let state: CastState = 'unavailable';
let initialized = false;
const listeners = new Set<(next: CastState) => void>();

function publish(next: CastState) {
  state = next;
  listeners.forEach((listener) => listener(next));
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

export async function castMedia(input: { src: string; contentType: string; title?: string; poster?: string; currentTime: number }) {
  initialize();
  const context = window.cast?.framework.CastContext.getInstance();
  if (!context || !window.chrome?.cast) throw new Error('Google Cast is unavailable');
  let session = context.getCurrentSession();
  if (!session) {
    await context.requestSession();
    session = context.getCurrentSession();
  }
  if (!session) throw new Error('No Cast session was started');
  const media = new window.chrome.cast.media.MediaInfo(input.src, input.contentType);
  media.metadata = new window.chrome.cast.media.GenericMediaMetadata();
  media.metadata.title = input.title ?? '';
  if (input.poster) media.metadata.images = [new window.chrome.cast.Image(input.poster)];
  const request = new window.chrome.cast.media.LoadRequest(media);
  request.currentTime = input.currentTime;
  request.autoplay = true;
  await session.loadMedia(request);
  publish('connected');
}
