import type { PlaybackPlan } from './playback.ts';
import { DEFAULT_ENCODING, decodeArgs, forcedKeyframeArgs, rateControlArgs, threadArgs, videoFilters, type EncoderChoice, type EncodingOptions } from './hwaccel.ts';
import { toneMapped } from './streaming.ts';

/** Segment length. Short enough for snappy seeks, long enough to amortize the
 * per-segment encoder spawn. */
export const SEGMENT_SECONDS = 6;

/**
 * The quality ladder offered for a transcode. `source` keeps the negotiated
 * height; the fixed rungs give the client something cheaper to switch down to.
 * Rungs at or above the source height are pointless and are dropped.
 */
export interface HlsVariant {
  id: string;
  label: string;
  height?: number;
  /** Rough peak bandwidth for the master playlist, bits per second. */
  bandwidth: number;
  /** x264 rate control for this rung at the default quality; the operator's quality shifts every rung together. */
  crf: number;
  maxBitrateK?: number;
}

export function ladderFor(sourceHeight: number | undefined): HlsVariant[] {
  const source: HlsVariant = {
    id: 'source',
    label: sourceHeight ? `${sourceHeight}p` : 'Source',
    height: sourceHeight,
    bandwidth: sourceHeight && sourceHeight > 1080 ? 18_000_000 : sourceHeight && sourceHeight > 720 ? 9_000_000 : 5_000_000,
    crf: 21,
  };
  const rungs: HlsVariant[] = [
    { id: '720', label: '720p', height: 720, bandwidth: 4_000_000, crf: 23, maxBitrateK: 4_000 },
    { id: '480', label: '480p', height: 480, bandwidth: 1_800_000, crf: 24, maxBitrateK: 1_800 },
  ];
  return [source, ...rungs.filter((rung) => sourceHeight == null || rung.height! < sourceHeight)];
}

/** Number of whole-or-partial segments covering a runtime. */
export function segmentCount(durationSeconds: number): number {
  return Math.max(1, Math.ceil(durationSeconds / SEGMENT_SECONDS));
}

/** The master playlist: one entry per rung, pointing at its media playlist. */
export function masterPlaylist(variants: HlsVariant[], mediaUrl: (variant: HlsVariant) => string): string {
  const lines = ['#EXTM3U', '#EXT-X-VERSION:3'];
  for (const variant of variants) {
    const resolution = variant.height ? `,RESOLUTION=${Math.round((variant.height * 16) / 9)}x${variant.height}` : '';
    lines.push(`#EXT-X-STREAM-INF:BANDWIDTH=${variant.bandwidth}${resolution},NAME="${variant.label}"`, mediaUrl(variant));
  }
  return `${lines.join('\n')}\n`;
}

/**
 * A VOD media playlist over fixed-length segments. Every segment URI is
 * deterministic, so a seek is just the client requesting a different index —
 * no server-side session to create or clean up.
 */
export function mediaPlaylist(durationSeconds: number, segmentUrl: (index: number) => string): string {
  const count = segmentCount(durationSeconds);
  const lines = [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    `#EXT-X-TARGETDURATION:${SEGMENT_SECONDS}`,
    '#EXT-X-MEDIA-SEQUENCE:0',
    '#EXT-X-PLAYLIST-TYPE:VOD',
  ];
  for (let index = 0; index < count; index++) {
    const length = index === count - 1 ? Math.max(0.5, durationSeconds - index * SEGMENT_SECONDS) : SEGMENT_SECONDS;
    lines.push(`#EXTINF:${length.toFixed(3)},`, segmentUrl(index));
  }
  lines.push('#EXT-X-ENDLIST');
  return `${lines.join('\n')}\n`;
}

/**
 * ffmpeg args for one segment: an input seek to the segment start (frame
 * accurate when re-encoding), exactly one segment of output, timestamps offset
 * so segments splice into one continuous timeline.
 *
 * Video is always re-encoded here. Copied video cannot be cut at arbitrary
 * 6-second marks — only at keyframes — and misaligned cuts stutter at every
 * boundary; x264 veryfast is the price of clean, seekable segments.
 */
export function buildSegmentArgs(input: string, plan: PlaybackPlan, variant: HlsVariant, index: number, durationSeconds: number, accel?: EncoderChoice | null, encoding: EncodingOptions = DEFAULT_ENCODING): string[] {
  const start = index * SEGMENT_SECONDS;
  const crf = variant.crf - DEFAULT_ENCODING.quality + encoding.quality;
  const remaining = Math.max(0.5, Math.min(SEGMENT_SECONDS, durationSeconds - start));
  const args = [
    '-hide_banner', '-loglevel', 'error',
    ...(accel ? decodeArgs(accel) : []),
    '-ss', String(start), '-t', remaining.toFixed(3), '-i', input,
  ];

  args.push('-map', '0:v:0');
  if (accel) {
    args.push('-c:v', accel.encoder, ...rateControlArgs(accel, crf, variant.maxBitrateK, encoding.preset));
    const filters = toneMapped(videoFilters(accel, variant.height), plan.video?.hdr);
    if (filters.length) args.push('-vf', filters.join(','));
  } else {
    args.push('-c:v', 'libx264', '-preset', encoding.preset, '-crf', String(crf), ...threadArgs(encoding));
    if (variant.maxBitrateK) args.push('-maxrate', `${variant.maxBitrateK}k`, '-bufsize', `${variant.maxBitrateK * 2}k`);
    const filters = toneMapped(variant.height ? [`scale=-2:${variant.height}`] : [], plan.video?.hdr);
    if (filters.length) args.push('-vf', filters.join(','));
  }
  // Every segment must open on a keyframe or the player cannot start mid-stream.
  args.push('-force_key_frames', 'expr:eq(n,0)', ...(accel ? forcedKeyframeArgs(accel) : []));

  args.push('-map', `0:a:${plan.audioTrackIndex ?? 0}?`, '-c:a', 'aac', '-b:a', '192k', '-ac', '2');

  args.push('-output_ts_offset', String(start), '-muxdelay', '0', '-f', 'mpegts', 'pipe:1');
  return args;
}
