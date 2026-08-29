// Derive a deterministic technical/quality profile from ffprobe output at scan
// time. Reads never run ffprobe; they read the persisted profile instead.

export interface ProbeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  channels?: number;
  bit_rate?: string | number;
  color_transfer?: string;
  color_primaries?: string;
  color_space?: string;
}

export interface Probe {
  format?: { format_name?: string; bit_rate?: string | number; duration?: string | number };
  streams?: ProbeStream[];
}

export interface TechnicalProfile {
  resolutionLabel: string | null;
  width: number | null;
  height: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  audioChannels: string | null;
  dynamicRange: string | null;
  bitrate: number | null;
  details: Record<string, unknown>;
}

function isVideo(stream: ProbeStream): boolean {
  return stream.codec_type === 'video' || (stream.codec_type == null && (stream.width != null || stream.height != null));
}

function isAudio(stream: ProbeStream): boolean {
  return stream.codec_type === 'audio' || (stream.codec_type == null && stream.channels != null);
}

function toNumber(value: string | number | undefined): number | null {
  if (value == null) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Map a pixel height to a marketing resolution label. */
export function resolutionLabel(height: number | null | undefined): string | null {
  if (height == null || height <= 0) return null;
  if (height >= 2000) return '4K';
  if (height >= 1400) return '1440p';
  if (height >= 1000) return '1080p';
  if (height >= 700) return '720p';
  if (height >= 400) return '480p';
  return 'SD';
}

/** Describe a channel count the way a player's audio menu would. */
export function channelLayout(channels: number | null | undefined): string | null {
  if (channels == null || channels <= 0) return null;
  if (channels === 1) return 'Mono';
  if (channels === 2) return 'Stereo';
  if (channels === 6) return '5.1';
  if (channels === 7) return '6.1';
  if (channels === 8) return '7.1';
  return `${channels} ch`;
}

/** Detect HDR flavour from color transfer characteristics; defaults to SDR for real video. */
export function dynamicRange(stream: ProbeStream | undefined): string | null {
  if (!stream) return null;
  const transfer = stream.color_transfer?.toLowerCase();
  if (transfer === 'smpte2084' || transfer === 'smpte-st-2084') return 'HDR10';
  if (transfer === 'arib-std-b67') return 'HLG';
  return 'SDR';
}

export function deriveTechnicalProfile(probe: Probe): TechnicalProfile {
  const streams = probe.streams ?? [];
  const video = streams.find(isVideo);
  const audio = streams.find(isAudio);
  const height = video?.height ?? null;
  const bitrate = toNumber(video?.bit_rate) ?? toNumber(probe.format?.bit_rate);

  const details: Record<string, unknown> = {};
  if (probe.format?.format_name) details.container = probe.format.format_name;
  if (video?.color_primaries) details.colorPrimaries = video.color_primaries;
  if (video?.color_transfer) details.colorTransfer = video.color_transfer;

  return {
    resolutionLabel: resolutionLabel(height),
    width: video?.width ?? null,
    height,
    videoCodec: video?.codec_name ?? null,
    audioCodec: audio?.codec_name ?? null,
    audioChannels: channelLayout(audio?.channels),
    dynamicRange: dynamicRange(video),
    bitrate,
    details,
  };
}
