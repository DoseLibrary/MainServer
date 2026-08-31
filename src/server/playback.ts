// Playback negotiation: compare a source file's ffprobe data against the
// client's declared capabilities and decide, per track, whether we can direct
// play, remux, or must transcode. The client says what it supports; the server
// picks the cheapest delivery that still plays.

export interface ClientCapabilities {
  /** Container formats the client can demux, e.g. `['mp4', 'webm']`. */
  containers: string[];
  /** Video codecs the client can decode, e.g. `['h264', 'hevc', 'av1']`. */
  videoCodecs: string[];
  /** Audio codecs the client can decode, e.g. `['aac', 'opus']`. */
  audioCodecs: string[];
  /** Optional display ceiling; taller video is downscaled while transcoding. */
  maxHeight?: number;
  /** Optional overall bitrate ceiling in bits per second. */
  maxBitrate?: number;
}

export interface ProbeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  channels?: number;
  bit_rate?: string | number;
}

export interface Probe {
  format?: { format_name?: string; bit_rate?: string | number; duration?: string | number };
  streams?: ProbeStream[];
}

export type TrackAction = 'copy' | 'transcode';

export interface PlaybackPlan {
  /** `direct` plays the source untouched; `transcode` repackages or re-encodes at least one part. */
  mode: 'direct' | 'transcode';
  /** Target container the client receives. */
  container: string;
  /** `true` when both tracks are copied but the container is repackaged (cheap, no re-encode). */
  remux: boolean;
  video: { action: TrackAction; codec: string; height?: number } | null;
  audio: { action: TrackAction; codec: string } | null;
  /** Which audio stream of the file to play, by position among audio streams. */
  audioTrackIndex: number;
  /** Human-readable notes on why each decision was made. */
  reasons: string[];
}

const DEFAULT_CONTAINER = 'mp4';
const DEFAULT_VIDEO = 'h264';
const DEFAULT_AUDIO = 'aac';

function isVideoStream(stream: ProbeStream): boolean {
  return stream.codec_type === 'video' || (stream.codec_type == null && (stream.width != null || stream.height != null));
}

function isAudioStream(stream: ProbeStream): boolean {
  return stream.codec_type === 'audio' || (stream.codec_type == null && stream.channels != null);
}

function toBitrate(value: string | number | undefined): number | undefined {
  if (value == null) return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Pick the first client-supported codec, preferring a widely compatible default. */
function preferred(supported: string[], fallback: string): string {
  if (supported.includes(fallback)) return fallback;
  return supported[0] ?? fallback;
}

export function negotiatePlayback(probe: Probe, capabilities: ClientCapabilities, requestedAudioTrackIndex = 0): PlaybackPlan {
  const reasons: string[] = [];
  const streams = probe.streams ?? [];
  const source = probe.format?.format_name ?? '';
  const containerTokens = source.split(',').map((token) => token.trim()).filter(Boolean);
  const matchedContainer = containerTokens.find((token) => capabilities.containers.includes(token));
  const containerSupported = matchedContainer != null;
  const container = matchedContainer ?? preferred(capabilities.containers, DEFAULT_CONTAINER);
  if (!containerSupported) reasons.push(`container ${source || 'unknown'} not supported; delivering ${container}`);

  const overallBitrate = toBitrate(probe.format?.bit_rate);

  const videoStream = streams.find(isVideoStream);
  let video: PlaybackPlan['video'] = null;
  if (videoStream) {
    const codec = videoStream.codec_name ?? '';
    const height = videoStream.height;
    const bitrate = toBitrate(videoStream.bit_rate) ?? overallBitrate;
    const codecOk = capabilities.videoCodecs.includes(codec);
    const heightOk = capabilities.maxHeight == null || (height ?? 0) <= capabilities.maxHeight;
    const bitrateOk = capabilities.maxBitrate == null || bitrate == null || bitrate <= capabilities.maxBitrate;
    if (codecOk && heightOk && bitrateOk) {
      video = { action: 'copy', codec, height };
    } else {
      const targetCodec = preferred(capabilities.videoCodecs, DEFAULT_VIDEO);
      const targetHeight = capabilities.maxHeight != null && height != null ? Math.min(height, capabilities.maxHeight) : height;
      video = { action: 'transcode', codec: targetCodec, height: targetHeight };
      if (!codecOk) reasons.push(`video codec ${codec || 'unknown'} unsupported; transcoding to ${targetCodec}`);
      else if (!heightOk) reasons.push(`video height ${height} exceeds ${capabilities.maxHeight}; downscaling`);
      else reasons.push('video bitrate exceeds client ceiling; transcoding');
    }
  }

  const audioStreams = streams.filter(isAudioStream);
  // A request for a track the file does not have falls back to the first one.
  const audioTrackIndex = audioStreams.length > 0
    ? Math.min(Math.max(Math.trunc(requestedAudioTrackIndex), 0), audioStreams.length - 1)
    : 0;
  const audioStream = audioStreams[audioTrackIndex];
  let audio: PlaybackPlan['audio'] = null;
  if (audioStream) {
    const codec = audioStream.codec_name ?? '';
    if (capabilities.audioCodecs.includes(codec)) {
      audio = { action: 'copy', codec };
    } else {
      const targetCodec = preferred(capabilities.audioCodecs, DEFAULT_AUDIO);
      audio = { action: 'transcode', codec: targetCodec };
      reasons.push(`audio codec ${codec || 'unknown'} unsupported; transcoding to ${targetCodec}`);
    }
  }

  const anyTranscode = video?.action === 'transcode' || audio?.action === 'transcode';
  // Serving the file as-is would hand the client every audio stream and let it
  // pick the first; a chosen alternate track therefore needs repackaging.
  const needsTrackSelection = audioTrackIndex > 0;
  const remux = !anyTranscode && (needsTrackSelection || !containerSupported) && (video != null || audio != null);
  const mode: PlaybackPlan['mode'] = !anyTranscode && containerSupported && !needsTrackSelection ? 'direct' : 'transcode';
  if (mode === 'direct') reasons.push('source is directly playable');
  else if (remux) reasons.push(needsTrackSelection
    ? 'selected audio track is repackaged into its own stream (no re-encode)'
    : 'tracks are compatible; repackaging container only (no re-encode)');

  return { mode, container, remux, video, audio, audioTrackIndex, reasons };
}

export interface AudioTrackInfo {
  /** Position among the file's audio streams; what a plan selects. */
  index: number;
  label: string;
  language?: string;
  codec?: string;
  channels?: number;
  default: boolean;
}

/** The selectable audio tracks of a probed file, in file order. */
export function audioTracksOf(probe: Probe): AudioTrackInfo[] {
  const streams = (probe.streams ?? []).filter(isAudioStream);
  return streams.map((stream, index) => {
    const tags = (stream as { tags?: Record<string, string> }).tags ?? {};
    const language = tags.language ?? tags.LANGUAGE;
    const channels = stream.channels;
    const title = tags.title ?? tags.TITLE;
    const parts = [title ?? language?.toUpperCase() ?? `Track ${index + 1}`];
    if (stream.codec_name) parts.push(stream.codec_name.toUpperCase());
    if (channels) parts.push(channels === 6 ? '5.1' : channels === 8 ? '7.1' : channels === 2 ? 'Stereo' : `${channels}ch`);
    return {
      index,
      label: parts.join(' · '),
      language,
      codec: stream.codec_name ?? undefined,
      channels: channels ?? undefined,
      default: (stream as { disposition?: { default?: number } }).disposition?.default === 1 || index === 0,
    };
  });
}
