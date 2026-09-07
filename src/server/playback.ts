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
  color_transfer?: string;
  color_primaries?: string;
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
  /** `hdr` marks a PQ/HLG source: a copy passes it through, a re-encode must tone-map it. */
  video: { action: TrackAction; codec: string; height?: number; hdr?: boolean } | null;
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

/**
 * ffprobe names one demuxer for both `.mkv` and `.webm` (`matroska,webm`), so a
 * browser that reports WebM support would otherwise be handed a Matroska file
 * it cannot play. Only a WebM-shaped payload keeps the `webm` token.
 */
const WEBM_VIDEO_CODECS = new Set(['vp8', 'vp9', 'av1']);
const WEBM_AUDIO_CODECS = new Set(['vorbis', 'opus']);

/**
 * Clients name containers by file extension while ffprobe names the demuxer;
 * `mkv` and `matroska` are the one pair that differs and it has to match, or
 * an Android TV that plays Matroska natively is handed a remux instead.
 */
function containerToken(token: string): string {
  return token === 'mkv' ? 'matroska' : token;
}

/** PQ (HDR10, Dolby Vision profiles 8.x) and HLG transfer characteristics. */
const HDR_TRANSFERS = new Set(['smpte2084', 'smpte-st-2084', 'arib-std-b67']);

function isHdr(stream: ProbeStream): boolean {
  return HDR_TRANSFERS.has(stream.color_transfer?.toLowerCase() ?? '');
}

function sourceContainers(formatName: string, streams: ProbeStream[]): string[] {
  const tokens = formatName.split(',').map((token) => token.trim()).filter(Boolean);
  if (!tokens.includes('matroska') || !tokens.includes('webm')) return tokens;
  const video = streams.find(isVideoStream)?.codec_name;
  const audio = streams.find(isAudioStream)?.codec_name;
  const webm = (video == null || WEBM_VIDEO_CODECS.has(video)) && (audio == null || WEBM_AUDIO_CODECS.has(audio));
  return tokens.filter((token) => (webm ? token !== 'matroska' : token !== 'webm'));
}

export interface NegotiationOptions {
  /**
   * Whether the source may be handed to the client untouched. A fragmented MP4
   * matches on container and codecs but stalls a progressive player, so the
   * caller marks it unplayable and negotiation repackages it instead.
   */
  directPlayable?: boolean;
}

export function negotiatePlayback(probe: Probe, capabilities: ClientCapabilities, requestedAudioTrackIndex = 0, options: NegotiationOptions = {}): PlaybackPlan {
  const reasons: string[] = [];
  const streams = probe.streams ?? [];
  const source = probe.format?.format_name ?? '';
  const containerTokens = sourceContainers(source, streams);
  const clientContainers = capabilities.containers.map(containerToken);
  const matchedContainer = containerTokens.find((token) => clientContainers.includes(token));
  const containerSupported = matchedContainer != null && options.directPlayable !== false;
  if (matchedContainer != null && !containerSupported) reasons.push('source container is not progressively playable; repackaging');
  // Everything the pipeline builds is fragmented mp4, so only a direct play keeps
  // the source container; a remux or re-encode is delivered in what we can produce.
  const deliveryContainer = preferred(clientContainers, DEFAULT_CONTAINER);
  if (matchedContainer == null) reasons.push(`container ${source || 'unknown'} not supported; delivering ${deliveryContainer}`);

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
    const hdr = isHdr(videoStream) ? { hdr: true } : {};
    if (codecOk && heightOk && bitrateOk) {
      video = { action: 'copy', codec, height, ...hdr };
    } else {
      const targetCodec = preferred(capabilities.videoCodecs, DEFAULT_VIDEO);
      const targetHeight = capabilities.maxHeight != null && height != null ? Math.min(height, capabilities.maxHeight) : height;
      video = { action: 'transcode', codec: targetCodec, height: targetHeight, ...hdr };
      if (!codecOk) reasons.push(`video codec ${codec || 'unknown'} unsupported; transcoding to ${targetCodec}`);
      else if (!heightOk) reasons.push(`video height ${height} exceeds ${capabilities.maxHeight}; downscaling`);
      else reasons.push('video bitrate exceeds client ceiling; transcoding');
      if (hdr.hdr) reasons.push('HDR source is tone-mapped to SDR while re-encoding');
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

  const container = mode === 'direct' && matchedContainer != null ? matchedContainer : deliveryContainer;

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
