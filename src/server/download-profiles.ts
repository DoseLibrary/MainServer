/**
 * Download profiles.
 *
 * A downloaded file has to play on a phone that may be five years old and
 * offline, so both profiles are H.264 High plus AAC stereo in MP4 — the one
 * combination every iOS and Android device decodes without negotiation. The
 * same constants produce the ffmpeg arguments and the size estimate, so what a
 * viewer is told before committing to a season matches what lands on the device.
 */

export type DownloadProfileId = 'sd' | 'hd';

export interface DownloadProfile {
  id: DownloadProfileId;
  label: string;
  height: number;
  /** Video bitrate in bits per second; the estimate's dominant term. */
  videoBitrate: number;
  audioBitrate: number;
  crf: number;
}

export const DOWNLOAD_PROFILES: Record<DownloadProfileId, DownloadProfile> = {
  sd: { id: 'sd', label: '480p', height: 480, videoBitrate: 900_000, audioBitrate: 128_000, crf: 24 },
  hd: { id: 'hd', label: '720p', height: 720, videoBitrate: 1_700_000, audioBitrate: 128_000, crf: 22 },
};

export const DEFAULT_DOWNLOAD_PROFILE: DownloadProfileId = 'sd';

export function isDownloadProfile(value: string): value is DownloadProfileId {
  return value === 'sd' || value === 'hd';
}

/** Bytes a title of this runtime is expected to occupy at this profile. */
export function estimateBytes(durationSeconds: number, profile: DownloadProfile): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0;
  // Container overhead is small but real; 2% keeps estimates from reading low,
  // which matters when the answer decides whether a season fits.
  const bitsPerSecond = profile.videoBitrate + profile.audioBitrate;
  return Math.round((durationSeconds * bitsPerSecond * 1.02) / 8);
}

/** Total for a set of runtimes, for the season figure shown before committing. */
export function estimateTotalBytes(durationsSeconds: readonly number[], profile: DownloadProfile): number {
  return durationsSeconds.reduce((total, duration) => total + estimateBytes(duration, profile), 0);
}

/**
 * ffmpeg arguments producing a single playable file.
 *
 * `+faststart` moves the moov atom to the front once encoding finishes, which
 * is what lets a phone start playing without reading the whole file — and is
 * why a download is only served after the encode completes.
 */
export function buildDownloadArgs(inputPath: string, outputPath: string, profile: DownloadProfile, audioTrackIndex = 0): string[] {
  return [
    '-hide_banner', '-loglevel', 'error', '-y', '-i', inputPath,
    '-map', '0:v:0', '-map', `0:a:${audioTrackIndex}?`,
    '-c:v', 'libx264', '-profile:v', 'high', '-level', '4.0', '-preset', 'veryfast',
    '-crf', String(profile.crf), '-maxrate', String(profile.videoBitrate), '-bufsize', String(profile.videoBitrate * 2),
    '-vf', `scale=-2:${profile.height}`, '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', String(profile.audioBitrate), '-ac', '2',
    '-movflags', '+faststart',
    outputPath,
  ];
}
