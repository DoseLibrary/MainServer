import type { ClientCapabilities } from './api';

function playable(video: HTMLVideoElement, mime: string): boolean {
  return video.canPlayType(mime) !== '';
}

/** Build a conservative browser capability profile for server negotiation. */
export function detectMediaCapabilities(): ClientCapabilities {
  const video = document.createElement('video');
  const containers: string[] = [];
  const videoCodecs: string[] = [];
  const audioCodecs: string[] = [];
  if (playable(video, 'video/mp4')) containers.push('mp4', 'mov');
  if (playable(video, 'video/webm')) containers.push('webm');
  if (playable(video, 'video/mp4; codecs="avc1.42E01E"')) videoCodecs.push('h264');
  if (playable(video, 'video/mp4; codecs="hvc1"')) videoCodecs.push('hevc');
  if (playable(video, 'video/webm; codecs="vp9"')) videoCodecs.push('vp9');
  if (playable(video, 'video/mp4; codecs="av01.0.05M.08"')) videoCodecs.push('av1');
  if (playable(video, 'audio/mp4; codecs="mp4a.40.2"')) audioCodecs.push('aac');
  if (playable(video, 'audio/webm; codecs="opus"')) audioCodecs.push('opus');
  if (playable(video, 'audio/mpeg')) audioCodecs.push('mp3');
  return { containers, videoCodecs, audioCodecs, maxHeight: Math.max(window.screen?.height ?? 1080, 720) };
}
