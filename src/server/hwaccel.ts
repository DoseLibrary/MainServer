import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Hardware transcoding: find the GPU encoders this box can actually use, and
 * build the ffmpeg arguments that drive them.
 *
 * Detection is deliberately paranoid. `ffmpeg -encoders` lists every encoder
 * the binary was *built* with, which on a stock build means NVENC, QSV, AMF and
 * VAAPI are all "available" on a machine with no GPU at all. The only honest
 * test is to run the encoder, so every candidate encodes one frame of synthetic
 * video with the exact arguments playback would use. An encoder that survives
 * that will not fail mid-film.
 */

export type HwFamily = 'nvenc' | 'qsv' | 'amf' | 'videotoolbox' | 'vaapi';
export type AccelMode = 'auto' | 'off' | HwFamily;

/** Priority order when several families work: fastest and most predictable first. */
export const FAMILY_ORDER: HwFamily[] = ['nvenc', 'qsv', 'videotoolbox', 'amf', 'vaapi'];

export const FAMILY_LABELS: Record<HwFamily, string> = {
  nvenc: 'NVIDIA NVENC',
  qsv: 'Intel Quick Sync',
  amf: 'AMD AMF',
  videotoolbox: 'Apple VideoToolbox',
  vaapi: 'VAAPI',
};

/** Encoder names per family, by the codec they produce. */
const FAMILY_ENCODERS: Record<HwFamily, Partial<Record<string, string>>> = {
  nvenc: { h264: 'h264_nvenc', hevc: 'hevc_nvenc', av1: 'av1_nvenc' },
  qsv: { h264: 'h264_qsv', hevc: 'hevc_qsv', av1: 'av1_qsv' },
  amf: { h264: 'h264_amf', hevc: 'hevc_amf', av1: 'av1_amf' },
  videotoolbox: { h264: 'h264_videotoolbox', hevc: 'hevc_videotoolbox' },
  vaapi: { h264: 'h264_vaapi', hevc: 'hevc_vaapi', av1: 'av1_vaapi' },
};

/** ffmpeg `-hwaccel` value used to offload decoding as well as encoding. */
const FAMILY_DECODERS: Partial<Record<HwFamily, string>> = {
  nvenc: 'cuda',
  qsv: 'qsv',
  videotoolbox: 'videotoolbox',
  vaapi: 'vaapi',
};

export const DEFAULT_VAAPI_DEVICE = '/dev/dri/renderD128';

/** A usable encoder plus how to feed it. */
export interface EncoderChoice {
  family: HwFamily | 'software';
  /** ffmpeg encoder name, e.g. `h264_nvenc`. */
  encoder: string;
  codec: string;
  /** `-hwaccel` value, when decoding is offloaded too. */
  decode?: string;
  /** Render node for VAAPI. */
  device?: string;
}

export interface EncoderProbeResult {
  family: HwFamily;
  encoder: string;
  codec: string;
  /** Present in the ffmpeg build. */
  built: boolean;
  /** Survived a real one-frame encode. */
  working: boolean;
  /** Why it failed, trimmed for display. */
  error?: string;
}

export interface HardwareReport {
  /** Names of the graphics adapters we could identify, best effort. */
  adapters: string[];
  encoders: EncoderProbeResult[];
  /** Families with at least one working encoder, in preference order. */
  available: HwFamily[];
  /** What playback will actually use, honoring the configured mode. */
  selected: HwFamily | null;
  mode: AccelMode;
  /** Set when the configured family was asked for but does not work here. */
  warning?: string;
  detectedAt: string;
}

export interface CommandRunner {
  (file: string, args: string[], timeoutMs: number): Promise<{ stdout: string; stderr: string }>;
}

const defaultRunner: CommandRunner = async (file, args, timeoutMs) => {
  const { stdout, stderr } = await execFileAsync(file, args, { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 });
  return { stdout: String(stdout), stderr: String(stderr) };
};

/**
 * The rate-control arguments for one encoder at a given quality.
 *
 * `quality` is expressed on the x264 CRF scale that the software path uses;
 * each family maps it onto its own control, which is never quite the same
 * number and never quite the same meaning.
 */
export function rateControlArgs(choice: EncoderChoice, quality: number, maxBitrateK?: number): string[] {
  const cap = maxBitrateK ? ['-maxrate', `${maxBitrateK}k`, '-bufsize', `${maxBitrateK * 2}k`] : [];
  switch (choice.family) {
    case 'nvenc':
      // p4 is NVENC's balanced preset; constant-quality mode needs an explicit
      // zero target bitrate or the encoder quietly reverts to plain VBR.
      return ['-preset', 'p4', '-rc', 'vbr', '-cq', String(quality + 2), '-b:v', '0', ...cap];
    case 'qsv':
      return ['-preset', 'veryfast', '-global_quality', String(quality + 2), ...cap];
    case 'amf':
      return ['-quality', 'balanced', '-rc', 'cqp', '-qp_i', String(quality + 2), '-qp_p', String(quality + 3), ...cap];
    case 'videotoolbox':
      // VideoToolbox has no quality control that behaves the same across ffmpeg
      // versions, so it gets a bitrate target derived from the requested CRF.
      return ['-b:v', `${maxBitrateK ?? Math.round(24_000 / Math.max(1, quality - 10))}k`];
    case 'vaapi':
      return ['-rc_mode', 'CQP', '-qp', String(quality + 2), ...cap];
    default:
      return ['-preset', 'veryfast', '-crf', String(quality), ...cap];
  }
}

/**
 * Video filter chain for a target height. VAAPI encodes from GPU surfaces, so
 * frames are scaled in software and uploaded; every other family takes ordinary
 * system-memory frames.
 */
export function videoFilters(choice: EncoderChoice, height?: number): string[] {
  const scale = height ? [`scale=-2:${height}`] : [];
  if (choice.family === 'vaapi') return [...scale, 'format=nv12', 'hwupload'];
  return scale;
}

/** Arguments that must appear before `-i`. */
export function decodeArgs(choice: EncoderChoice): string[] {
  const args: string[] = [];
  if (choice.family === 'vaapi') args.push('-vaapi_device', choice.device ?? DEFAULT_VAAPI_DEVICE);
  // Decoded frames come back to system memory: the decode still runs on the
  // GPU, but the filter graph stays ordinary, which is what keeps this working
  // across the format mismatches a full GPU pipeline runs into.
  if (choice.decode) args.push('-hwaccel', choice.decode);
  return args;
}

/**
 * The encoder for a codec in a family, or null when that family cannot produce it.
 *
 * `offloadDecode` moves decoding to the GPU as well. It is off by default
 * because it is not a free win: decoded frames must come back across PCIe for
 * filtering, and on a capable CPU that transfer costs more than the GPU decode
 * saves. Measured on an i7-13700KF with an RTX 4070 Ti SUPER, four concurrent
 * 4K HEVC to 1080p transcodes took 6.4s with software decode and 7.0s with
 * decode offloaded — the offload was the slowest hardware option of the three
 * tried. It earns its keep only when the CPU is too weak to decode in real
 * time, which is why it is a setting rather than a default. It is also the
 * fragile half: 10-bit and HDR sources hit format mismatches that plain
 * software decode never does.
 */
export function encoderFor(family: HwFamily | 'software', codec: string, device?: string, offloadDecode = false): EncoderChoice | null {
  if (family === 'software') return null;
  const encoder = FAMILY_ENCODERS[family][codec];
  if (!encoder) return null;
  return {
    family,
    encoder,
    codec,
    decode: offloadDecode ? FAMILY_DECODERS[family] : undefined,
    device: family === 'vaapi' ? device ?? DEFAULT_VAAPI_DEVICE : undefined,
  };
}

/** Encoders present in the ffmpeg build, by name. */
export async function listBuiltEncoders(run: CommandRunner = defaultRunner): Promise<Set<string>> {
  try {
    const { stdout } = await run('ffmpeg', ['-hide_banner', '-encoders'], 15_000);
    const names = new Set<string>();
    for (const line of stdout.split('\n')) {
      // Lines look like ` V....D h264_nvenc    NVIDIA NVENC H.264 encoder`
      const match = /^\s*[A-Z.]{6}\s+([A-Za-z0-9_]+)/.exec(line);
      if (match?.[1]) names.add(match[1]);
    }
    return names;
  } catch {
    return new Set();
  }
}

/**
 * Encode one frame of synthetic video with the exact arguments playback uses.
 * This is the test that separates "ffmpeg was built with NVENC" from "this
 * machine has an NVIDIA card that will encode".
 */
export async function probeEncoder(choice: EncoderChoice, run: CommandRunner = defaultRunner): Promise<{ working: boolean; error?: string }> {
  const filters = videoFilters(choice);
  const args = [
    '-hide_banner', '-loglevel', 'error',
    ...(choice.family === 'vaapi' ? ['-vaapi_device', choice.device ?? DEFAULT_VAAPI_DEVICE] : []),
    '-f', 'lavfi', '-i', 'color=black:s=320x240:r=10:d=0.2',
    ...(filters.length ? ['-vf', filters.join(',')] : []),
    '-c:v', choice.encoder, ...rateControlArgs(choice, 23),
    '-frames:v', '1', '-f', 'null', '-',
  ];
  try {
    await run('ffmpeg', args, 25_000);
    return { working: true };
  } catch (cause) {
    const message = cause instanceof Error ? (cause as Error & { stderr?: string }).stderr ?? cause.message : String(cause);
    return { working: false, error: message.trim().split('\n').filter(Boolean).pop()?.slice(0, 200) };
  }
}

/**
 * Extra flags needed when the caller forces a keyframe at a specific frame.
 * NVENC otherwise honors the request with a plain I-frame, which is not a
 * seekable entry point — an HLS segment opening on one will not start.
 */
export function forcedKeyframeArgs(choice: EncoderChoice): string[] {
  return choice.family === 'nvenc' ? ['-forced-idr', '1'] : [];
}

/** Graphics adapter names, best effort and never fatal. */
export async function detectAdapters(run: CommandRunner = defaultRunner, platform: NodeJS.Platform = process.platform): Promise<string[]> {
  const names: string[] = [];
  try {
    const { stdout } = await run('nvidia-smi', ['--query-gpu=name', '--format=csv,noheader'], 8_000);
    names.push(...stdout.split('\n').map((line) => line.trim()).filter(Boolean));
  } catch { /* no NVIDIA driver present */ }
  if (names.length === 0 && platform === 'win32') {
    try {
      const { stdout } = await run('powershell', ['-NoProfile', '-Command', '(Get-CimInstance Win32_VideoController).Name'], 15_000);
      names.push(...stdout.split('\n').map((line) => line.trim()).filter(Boolean));
    } catch { /* WMI unavailable */ }
  }
  if (names.length === 0 && platform === 'linux') {
    try {
      const { stdout } = await run('sh', ['-c', 'lspci | grep -Ei "vga|3d|display"'], 8_000);
      names.push(...stdout.split('\n').map((line) => line.replace(/^.*?:\s*/, '').trim()).filter(Boolean));
    } catch { /* lspci missing, common in containers */ }
  }
  return [...new Set(names)].slice(0, 8);
}

/** Codecs worth probing: what a transcode may be asked to produce. */
const PROBE_CODECS = ['h264', 'hevc'];

export interface DetectOptions {
  mode?: AccelMode;
  device?: string;
  /** Decode on the GPU too. Off by default; see `encoderFor`. */
  offloadDecode?: boolean;
  run?: CommandRunner;
  platform?: NodeJS.Platform;
  now?: () => Date;
}

/** Full detection sweep: what the build has, what the hardware honors, what we pick. */
export async function detectHardware(options: DetectOptions = {}): Promise<HardwareReport> {
  const { mode = 'auto', device, offloadDecode = false, run = defaultRunner, platform = process.platform, now = () => new Date() } = options;
  const detectedAt = now().toISOString();
  if (mode === 'off') return { adapters: [], encoders: [], available: [], selected: null, mode, detectedAt };

  const [adapters, built] = await Promise.all([detectAdapters(run, platform), listBuiltEncoders(run)]);
  const families = mode === 'auto' ? FAMILY_ORDER : [mode];
  const candidates: EncoderChoice[] = [];
  for (const family of families) {
    for (const codec of PROBE_CODECS) {
      const choice = encoderFor(family, codec, device, offloadDecode);
      if (choice) candidates.push(choice);
    }
  }

  // Probes run one at a time: several encoders competing for the same device
  // can fail for want of a session rather than want of support.
  const encoders: EncoderProbeResult[] = [];
  for (const choice of candidates) {
    const family = choice.family as HwFamily;
    if (!built.has(choice.encoder)) {
      encoders.push({ family, encoder: choice.encoder, codec: choice.codec, built: false, working: false, error: 'Not in this ffmpeg build' });
      continue;
    }
    const result = await probeEncoder(choice, run);
    encoders.push({ family, encoder: choice.encoder, codec: choice.codec, built: true, ...result });
  }

  // h264 is the codec every client can play, so a family only counts as
  // available when its h264 encoder works.
  const available = FAMILY_ORDER.filter((family) => encoders.some((entry) => entry.family === family && entry.codec === 'h264' && entry.working));
  const selected = mode === 'auto' ? available[0] ?? null : available.includes(mode) ? mode : null;
  const warning = mode !== 'auto' && selected == null
    ? `${FAMILY_LABELS[mode]} was requested but no working encoder was found; falling back to software.`
    : undefined;

  return { adapters, encoders, available, selected, mode, warning, detectedAt };
}

/**
 * Holds the detection result for the process. Detection spawns ffmpeg several
 * times, so it runs once at startup and on explicit refresh — never per stream.
 */
export class HardwareAccelerator {
  private report: HardwareReport | null = null;
  private inflight: Promise<HardwareReport> | null = null;

  constructor(private readonly options: DetectOptions = {}) {}

  /** The cached report, detecting on first call. Concurrent callers share one sweep. */
  async ready(): Promise<HardwareReport> {
    if (this.report) return this.report;
    this.inflight ??= detectHardware(this.options)
      .then((report) => { this.report = report; return report; })
      .finally(() => { this.inflight = null; });
    return this.inflight;
  }

  /** Re-run detection, e.g. after a driver install. */
  async refresh(): Promise<HardwareReport> {
    this.report = null;
    return this.ready();
  }

  /** What is known right now, without waiting. Null until the first sweep lands. */
  current(): HardwareReport | null { return this.report; }

  /**
   * The encoder to use for a codec, or null for the software path. Synchronous
   * on purpose: the streaming routes must not wait on detection, and a stream
   * that starts before the first sweep lands simply uses software.
   */
  choose(codec: string): EncoderChoice | null {
    const family = this.report?.selected;
    if (!family) return null;
    return encoderFor(family, codec, this.options.device, this.options.offloadDecode);
  }
}
