import type { ClientCapabilities } from './api';

function playable(video: HTMLVideoElement, mime: string): boolean {
  return video.canPlayType(mime) !== '';
}

/**
 * Build a conservative browser capability profile for server negotiation.
 *
 * Codec probes carry full RFC 6381 strings: Chromium answers `""` to a bare
 * `hvc1` even on a machine that decodes HEVC in hardware, and only commits to
 * a profile-and-level string. Matroska is probed as a container in its own
 * right, since Chromium demuxes it while Firefox and Safari do not.
 */
export function detectMediaCapabilities(): ClientCapabilities {
  const video = document.createElement('video');
  const containers: string[] = [];
  const videoCodecs: string[] = [];
  const audioCodecs: string[] = [];
  if (playable(video, 'video/mp4')) containers.push('mp4', 'mov');
  if (playable(video, 'video/webm')) containers.push('webm');
  if (playable(video, 'video/x-matroska')) containers.push('matroska');
  if (playable(video, 'video/mp4; codecs="avc1.42E01E"')) videoCodecs.push('h264');
  // Main profile; Main 10 (`hvc1.2.4.L153.B0`) rides along wherever Main does.
  if (playable(video, 'video/mp4; codecs="hvc1.1.6.L120.90"')) videoCodecs.push('hevc');
  if (playable(video, 'video/webm; codecs="vp9"')) videoCodecs.push('vp9');
  if (playable(video, 'video/mp4; codecs="av01.0.05M.08"')) videoCodecs.push('av1');
  if (playable(video, 'audio/mp4; codecs="mp4a.40.2"')) audioCodecs.push('aac');
  if (playable(video, 'audio/mp4; codecs="ac-3"')) audioCodecs.push('ac3');
  if (playable(video, 'audio/mp4; codecs="ec-3"')) audioCodecs.push('eac3');
  if (playable(video, 'audio/webm; codecs="opus"')) audioCodecs.push('opus');
  if (playable(video, 'audio/mpeg')) audioCodecs.push('mp3');
  if (playable(video, 'audio/flac')) audioCodecs.push('flac');
  return { containers, videoCodecs, audioCodecs, maxHeight: Math.max(window.screen?.height ?? 1080, 720) };
}
