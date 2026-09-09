import { resolve, sep } from 'node:path';
import type { PlaybackPlan } from './playback.ts';
import { DEFAULT_ENCODING, decodeArgs, rateControlArgs, threadArgs, videoFilters, type EncoderChoice, type EncodingOptions } from './hwaccel.ts';

const PLAN_CODECS = /^[a-z0-9._-]{1,32}$/i;

const CONTENT_TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mkv: 'video/x-matroska',
  webm: 'video/webm',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  ts: 'video/mp2t',
};

export function contentTypeFor(path: string): string {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  return CONTENT_TYPES[ext] ?? 'application/octet-stream';
}

export interface RangeResult {
  status: 200 | 206 | 416;
  start: number;
  end: number;
  length: number;
}

/** Parse an HTTP Range header against a known size, RFC 7233 style. */
export function resolveRange(header: string | undefined, size: number): RangeResult {
  const full: RangeResult = { status: 200, start: 0, end: Math.max(0, size - 1), length: size };
  if (!header) return full;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return full;
  const [, rawStart, rawEnd] = match;
  if (rawStart === '' && rawEnd === '') return full;

  let start: number;
  let end: number;
  if (rawStart === '') {
    // Suffix range: last N bytes.
    const suffix = Number(rawEnd);
    if (suffix <= 0) return { status: 416, start: 0, end: 0, length: 0 };
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === '' ? size - 1 : Math.min(Number(rawEnd), size - 1);
  }
  if (start > end || start >= size) return { status: 416, start: 0, end: 0, length: 0 };
  return { status: 206, start, end, length: end - start + 1 };
}

/** Resolve a library-relative path to an absolute one, or null if it escapes the root. */
export function resolveWithin(root: string, relativePath: string): string | null {
  const base = resolve(root);
  const absolute = resolve(base, relativePath);
  if (absolute !== base && !absolute.startsWith(base + sep)) return null;
  return absolute;
}

const VIDEO_ENCODERS: Record<string, string> = {
  h264: 'libx264',
  hevc: 'libx265',
  vp9: 'libvpx-vp9',
  av1: 'libsvtav1',
};

/** Encoders that take more than two channels. */
const SURROUND_ENCODERS = new Set(['aac', 'opus', 'vorbis']);

const AUDIO_ENCODERS: Record<string, string> = {
  aac: 'aac',
  opus: 'libopus',
  mp3: 'libmp3lame',
  vorbis: 'libvorbis',
};

/**
 * HDR (PQ/HLG) frames re-encoded straight into an 8-bit SDR stream come out
 * grey and washed out. This chain converts to linear light, tone-maps with the
 * Hable curve, and lands in BT.709 limited range, which is what every SDR
 * player expects. It runs on the CPU in float, so it sits after any downscale.
 */
const TONE_MAP_TO_SDR = [
  'zscale=t=linear:npl=100',
  'format=gbrpf32le',
  'zscale=p=bt709',
  'tonemap=tonemap=hable:desat=0',
  'zscale=t=bt709:m=bt709:r=tv',
  'format=yuv420p',
];

/** Insert the tone-map chain after the scale step, before any GPU upload. */
export function toneMapped(filters: string[], hdr?: boolean): string[] {
  if (!hdr) return filters;
  const scaleAt = filters.findIndex((filter) => filter.startsWith('scale='));
  const at = scaleAt + 1;
  return [...filters.slice(0, at), ...TONE_MAP_TO_SDR, ...filters.slice(at)];
}

/**
 * Build ffmpeg args that realise a negotiated plan, streaming a fragmented MP4
 * to stdout. `accel` picks a GPU encoder; without it the software path runs.
 */
export function buildTranscodeArgs(plan: PlaybackPlan, inputPath: string, startSeconds?: number, accel?: EncoderChoice | null, encoding: EncodingOptions = DEFAULT_ENCODING): string[] {
  // Hardware decoding only helps when we also re-encode; a copied video track
  // is never decoded at all.
  const reEncoding = plan.video?.action === 'transcode';
  const encoder = reEncoding && accel?.codec === plan.video?.codec ? accel : null;
  // The input seek is frame-accurate when re-encoding and keyframe-accurate for
  // copied tracks; either is what a seek-restart wants. Output timestamps stay
  // zero-based, so the player offsets its timeline by the same start.
  const args = [
    '-hide_banner', '-loglevel', 'error',
    ...(encoder ? decodeArgs(encoder) : []),
    ...(startSeconds && startSeconds > 0 ? ['-ss', String(startSeconds)] : []),
    '-i', inputPath,
  ];

  if (plan.video) {
    args.push('-map', '0:v:0');
    if (plan.video.action === 'copy') {
      args.push('-c:v', 'copy');
      // ffmpeg tags copied HEVC as `hev1`; Safari and some TV players only
      // recognise `hvc1`, and every player accepts it.
      if (plan.video.codec === 'hevc') args.push('-tag:v', 'hvc1');
    } else if (encoder) {
      args.push('-c:v', encoder.encoder, ...rateControlArgs(encoder, encoding.quality, undefined, encoding.preset));
      const filters = toneMapped(videoFilters(encoder, plan.video.height), plan.video.hdr);
      if (filters.length) args.push('-vf', filters.join(','));
    } else {
      args.push('-c:v', VIDEO_ENCODERS[plan.video.codec] ?? 'libx264', '-preset', encoding.preset, '-crf', String(encoding.quality), ...threadArgs(encoding));
      const filters = toneMapped(plan.video.height ? [`scale=-2:${plan.video.height}`] : [], plan.video.hdr);
      if (filters.length) args.push('-vf', filters.join(','));
    }
  }

  if (plan.audio) {
    args.push('-map', `0:a:${plan.audioTrackIndex ?? 0}`);
    if (plan.audio.action === 'copy') args.push('-c:a', 'copy');
    else {
      // Some sources (notably converted E-AC-3) carry six channels with no
      // named layout, which the AAC encoder refuses outright; naming the
      // layouts it may pick makes swresample map the channels instead.
      const layouts = SURROUND_ENCODERS.has(plan.audio.codec) ? '7.1|5.1|stereo|mono' : 'stereo|mono';
      args.push('-c:a', AUDIO_ENCODERS[plan.audio.codec] ?? 'aac', '-b:a', '192k', '-af', `aformat=channel_layouts=${layouts}`);
    }
  }

  // Fragmented MP4 so playback starts before the whole file is produced.
  args.push('-f', 'mp4', '-movflags', 'frag_keyframe+empty_moov+default_base_moof', 'pipe:1');
  return args;
}

/**
 * Carry the server-selected plan from negotiation to the GET stream request.
 * The value is opaque to clients, but decoded defensively because URLs are
 * user-controlled input.
 */
export function encodePlaybackPlan(plan: PlaybackPlan): string {
  return Buffer.from(JSON.stringify(plan), 'utf8').toString('base64url');
}

export function decodePlaybackPlan(value: string): PlaybackPlan | null {
  try {
    const raw = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<PlaybackPlan>;
    if (raw.mode !== 'transcode' || raw.container !== 'mp4' || typeof raw.remux !== 'boolean' || !Array.isArray(raw.reasons)) return null;
    const validTrack = (track: PlaybackPlan['video'] | PlaybackPlan['audio'] | undefined): boolean => track == null ||
      ((track.action === 'copy' || track.action === 'transcode') && typeof track.codec === 'string' && PLAN_CODECS.test(track.codec));
    if (!validTrack(raw.video) || !validTrack(raw.audio)) return null;
    if (raw.video?.height != null && (!Number.isInteger(raw.video.height) || raw.video.height <= 0 || raw.video.height > 16384)) return null;
    if (raw.video?.hdr != null && typeof raw.video.hdr !== 'boolean') return null;
    return raw as PlaybackPlan;
  } catch {
    return null;
  }
}
