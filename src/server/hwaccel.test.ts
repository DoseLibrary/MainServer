import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it, vi } from 'vitest';
import {
  HardwareAccelerator, decodeArgs, detectAdapters, detectHardware, encoderFor,
  forcedKeyframeArgs, listBuiltEncoders, probeEncoder, rateControlArgs, videoFilters,
  type CommandRunner, type EncoderChoice,
} from './hwaccel.ts';
import { buildSegmentArgs, ladderFor } from './hls.ts';
import { buildTranscodeArgs } from './streaming.ts';
import type { PlaybackPlan } from './playback.ts';

const execFileAsync = promisify(execFile);

const ENCODER_LIST = [
  'Encoders:',
  ' V..... libx264              libx264 H.264 / AVC',
  ' V....D h264_nvenc           NVIDIA NVENC H.264 encoder',
  ' V....D hevc_nvenc           NVIDIA NVENC hevc encoder',
  ' V....D h264_qsv             H.264 / AVC (Intel Quick Sync Video)',
  ' A..... aac                  AAC (Advanced Audio Coding)',
].join('\n');

/** A runner that answers `-encoders` from a list and each probe from a verdict map. */
function runnerFor(built: string, working: Record<string, boolean>, extra: Record<string, string> = {}): CommandRunner {
  return vi.fn(async (file: string, args: string[]) => {
    if (file in extra) return { stdout: extra[file]!, stderr: '' };
    if (file !== 'ffmpeg') throw new Error(`${file}: not found`);
    if (args.includes('-encoders')) return { stdout: built, stderr: '' };
    const encoder = args[args.indexOf('-c:v') + 1]!;
    if (working[encoder]) return { stdout: '', stderr: '' };
    const failure = new Error('ffmpeg failed') as Error & { stderr: string };
    failure.stderr = `Cannot load nvcuda.dll\nNo capable devices found for ${encoder}`;
    throw failure;
  });
}

describe('encoder arguments per family', () => {
  const choice = (family: EncoderChoice['family']) => encoderFor(family, 'h264')!;

  it('maps the CRF scale onto each family own rate control', () => {
    expect(rateControlArgs(choice('nvenc'), 21)).toEqual(['-preset', 'p4', '-rc', 'vbr', '-cq', '23', '-b:v', '0']);
    expect(rateControlArgs(choice('qsv'), 21)).toEqual(['-preset', 'veryfast', '-global_quality', '23']);
    expect(rateControlArgs(choice('vaapi'), 21)).toEqual(['-rc_mode', 'CQP', '-qp', '23']);
    // A bitrate cap rides along with whatever the family constant-quality knob is.
    expect(rateControlArgs(choice('nvenc'), 23, 4000)).toContain('-maxrate');
    expect(rateControlArgs(choice('amf'), 23, 4000)).toEqual(expect.arrayContaining(['-rc', 'cqp', '-maxrate', '4000k', '-bufsize', '8000k']));
  });

  it('uploads frames for VAAPI and leaves every other family in system memory', () => {
    expect(videoFilters(choice('vaapi'), 720)).toEqual(['scale=-2:720', 'format=nv12', 'hwupload']);
    expect(videoFilters(choice('nvenc'), 720)).toEqual(['scale=-2:720']);
    expect(videoFilters(choice('nvenc'))).toEqual([]);
  });

  it('keeps decoding in software unless the offload is asked for', () => {
    // Measured slower than software decode on a capable CPU, so it is opt-in.
    expect(decodeArgs(choice('nvenc'))).toEqual([]);
    expect(decodeArgs(encoderFor('nvenc', 'h264', undefined, true)!)).toEqual(['-hwaccel', 'cuda']);
    // AMF has no decoder of its own; only the encode ever moves to the GPU.
    expect(decodeArgs(encoderFor('amf', 'h264', undefined, true)!)).toEqual([]);
  });

  it('names the VAAPI device before the input, offload or not', () => {
    expect(decodeArgs(choice('vaapi'))).toEqual(['-vaapi_device', '/dev/dri/renderD128']);
    expect(decodeArgs(encoderFor('vaapi', 'h264', undefined, true)!)).toEqual(['-vaapi_device', '/dev/dri/renderD128', '-hwaccel', 'vaapi']);
    expect(decodeArgs(encoderFor('vaapi', 'h264', '/dev/dri/renderD129')!)).toContain('/dev/dri/renderD129');
  });

  it('asks NVENC for real IDR frames when a keyframe is forced', () => {
    expect(forcedKeyframeArgs(choice('nvenc'))).toEqual(['-forced-idr', '1']);
    expect(forcedKeyframeArgs(choice('qsv'))).toEqual([]);
  });

  it('has no hardware encoder for a codec the family cannot produce', () => {
    expect(encoderFor('videotoolbox', 'av1')).toBeNull();
    expect(encoderFor('software', 'h264')).toBeNull();
    expect(encoderFor('nvenc', 'hevc')?.encoder).toBe('hevc_nvenc');
  });
});

describe('detection', () => {
  it('reads encoder names out of the ffmpeg build', async () => {
    const built = await listBuiltEncoders(runnerFor(ENCODER_LIST, {}));
    expect(built.has('h264_nvenc')).toBe(true);
    expect(built.has('h264_qsv')).toBe(true);
    expect(built.has('h264_amf')).toBe(false);
  });

  it('treats a missing ffmpeg as no encoders rather than an error', async () => {
    await expect(listBuiltEncoders(async () => { throw new Error('ENOENT'); })).resolves.toEqual(new Set());
  });

  it('trusts a real encode, not the build list', async () => {
    // Built with NVENC, but no NVIDIA card in the machine.
    const run = runnerFor(ENCODER_LIST, { h264_qsv: true });
    const report = await detectHardware({ run, platform: 'linux' });

    expect(report.available).toEqual(['qsv']);
    expect(report.selected).toBe('qsv');
    const nvenc = report.encoders.find((entry) => entry.encoder === 'h264_nvenc')!;
    expect(nvenc).toMatchObject({ built: true, working: false });
    expect(nvenc.error).toContain('No capable devices');
  });

  it('does not probe an encoder the build lacks', async () => {
    const run = runnerFor(ENCODER_LIST, { h264_nvenc: true });
    const report = await detectHardware({ run, platform: 'linux' });

    const amf = report.encoders.find((entry) => entry.encoder === 'h264_amf')!;
    expect(amf).toMatchObject({ built: false, working: false, error: 'Not in this ffmpeg build' });
    expect(run).not.toHaveBeenCalledWith('ffmpeg', expect.arrayContaining(['h264_amf']), expect.anything());
  });

  it('prefers NVENC when several families work', async () => {
    const report = await detectHardware({ run: runnerFor(ENCODER_LIST, { h264_nvenc: true, hevc_nvenc: true, h264_qsv: true }), platform: 'linux' });
    expect(report.available).toEqual(['nvenc', 'qsv']);
    expect(report.selected).toBe('nvenc');
  });

  it('honors a pinned family and warns when it cannot be used', async () => {
    const pinned = await detectHardware({ mode: 'qsv', run: runnerFor(ENCODER_LIST, { h264_qsv: true, h264_nvenc: true }), platform: 'linux' });
    expect(pinned.selected).toBe('qsv');
    expect(pinned.warning).toBeUndefined();

    const impossible = await detectHardware({ mode: 'nvenc', run: runnerFor(ENCODER_LIST, { h264_qsv: true }), platform: 'linux' });
    expect(impossible.selected).toBeNull();
    expect(impossible.warning).toContain('NVIDIA NVENC');
  });

  it('probes nothing at all when hardware is switched off', async () => {
    const run = runnerFor(ENCODER_LIST, { h264_nvenc: true });
    const report = await detectHardware({ mode: 'off', run });
    expect(report).toMatchObject({ selected: null, available: [], encoders: [] });
    expect(run).not.toHaveBeenCalled();
  });

  it('requires a working h264 encoder before calling a family available', async () => {
    // HEVC encodes but H.264 does not: unusable, since H.264 is the fallback
    // codec every client can play.
    const report = await detectHardware({ run: runnerFor(ENCODER_LIST, { hevc_nvenc: true }), platform: 'linux' });
    expect(report.available).toEqual([]);
    expect(report.selected).toBeNull();
  });

  it('names adapters from nvidia-smi, and falls back per platform', async () => {
    const withNvidia = runnerFor(ENCODER_LIST, {}, { 'nvidia-smi': 'NVIDIA GeForce RTX 4070\n' });
    expect(await detectAdapters(withNvidia, 'linux')).toEqual(['NVIDIA GeForce RTX 4070']);

    const windows = runnerFor(ENCODER_LIST, {}, { powershell: 'Intel(R) UHD Graphics 770\r\nNVIDIA GeForce RTX 4070\r\n' });
    expect(await detectAdapters(windows, 'win32')).toEqual(['Intel(R) UHD Graphics 770', 'NVIDIA GeForce RTX 4070']);

    // Nothing identifiable is normal in a container, and never an error.
    await expect(detectAdapters(runnerFor(ENCODER_LIST, {}), 'linux')).resolves.toEqual([]);
  });
});

describe('HardwareAccelerator', () => {
  it('detects once and shares the sweep with concurrent callers', async () => {
    const run = runnerFor(ENCODER_LIST, { h264_nvenc: true, hevc_nvenc: true }) as unknown as CommandRunner & { mock: { calls: unknown[] } };
    const accelerator = new HardwareAccelerator({ run, platform: 'linux' });

    const [first, second] = await Promise.all([accelerator.ready(), accelerator.ready()]);
    const spawnsForOneSweep = run.mock.calls.length;
    await accelerator.ready();

    expect(first).toBe(second);
    expect(spawnsForOneSweep).toBeGreaterThan(0);
    // Later callers get the cached report; detection never spawns ffmpeg again.
    expect(run).toHaveBeenCalledTimes(spawnsForOneSweep);
  });

  it('chooses software until the first sweep lands, then the detected encoder', async () => {
    const accelerator = new HardwareAccelerator({ run: runnerFor(ENCODER_LIST, { h264_nvenc: true }), platform: 'linux' });
    expect(accelerator.choose('h264')).toBeNull();

    await accelerator.ready();

    expect(accelerator.choose('h264')).toMatchObject({ family: 'nvenc', encoder: 'h264_nvenc' });
    // NVENC is selected but this build has no working AV1 rung for it.
    expect(accelerator.choose('vp9')).toBeNull();
  });

  it('re-probes on refresh, so a driver install is picked up without a restart', async () => {
    let working: Record<string, boolean> = {};
    const accelerator = new HardwareAccelerator({
      run: (file, args, timeout) => runnerFor(ENCODER_LIST, working)(file, args, timeout),
      platform: 'linux',
    });

    expect((await accelerator.ready()).selected).toBeNull();
    working = { h264_nvenc: true };
    expect((await accelerator.refresh()).selected).toBe('nvenc');
    expect(accelerator.current()?.selected).toBe('nvenc');
  });
});

describe('encoder choice reaching ffmpeg', () => {
  const plan: PlaybackPlan = {
    mode: 'transcode', container: 'mp4', remux: false,
    video: { action: 'transcode', codec: 'h264', height: 720 },
    audio: { action: 'transcode', codec: 'aac' }, audioTrackIndex: 0, reasons: [],
  };
  const nvenc = encoderFor('nvenc', 'h264')!;

  it('sends a transcode through the GPU encoder', () => {
    const args = buildTranscodeArgs(plan, '/media/a.mkv', undefined, nvenc);
    expect(args).toEqual(expect.arrayContaining(['-c:v', 'h264_nvenc', '-cq', '23']));
    expect(args).not.toContain('libx264');
  });

  it('puts the decode offload before the input it applies to', () => {
    const offloaded = encoderFor('nvenc', 'h264', undefined, true)!;
    const args = buildTranscodeArgs(plan, '/media/a.mkv', undefined, offloaded);
    expect(args.indexOf('-hwaccel')).toBeGreaterThanOrEqual(0);
    expect(args.indexOf('-hwaccel')).toBeLessThan(args.indexOf('-i'));
  });

  it('leaves a copied video track alone, hardware or not', () => {
    const copyPlan: PlaybackPlan = { ...plan, remux: true, video: { action: 'copy', codec: 'h264' } };
    const args = buildTranscodeArgs(copyPlan, '/media/a.mkv', undefined, encoderFor('nvenc', 'h264', undefined, true));
    expect(args).toEqual(expect.arrayContaining(['-c:v', 'copy']));
    // Nothing is decoded, so nothing is offloaded.
    expect(args).not.toContain('-hwaccel');
  });

  it('ignores an encoder built for a different codec than the plan wants', () => {
    const hevcPlan: PlaybackPlan = { ...plan, video: { action: 'transcode', codec: 'hevc', height: 720 } };
    expect(buildTranscodeArgs(hevcPlan, '/media/a.mkv', undefined, nvenc)).toEqual(expect.arrayContaining(['-c:v', 'libx265']));
  });

  it('encodes HLS segments on the GPU and still forces a seekable opening frame', () => {
    const variant = ladderFor(1080).find((entry) => entry.id === '720')!;
    const args = buildSegmentArgs('/media/a.mkv', plan, variant, 3, 600, nvenc);

    expect(args).toEqual(expect.arrayContaining(['-c:v', 'h264_nvenc', '-force_key_frames', 'expr:eq(n,0)', '-forced-idr', '1']));
    expect(args).toEqual(expect.arrayContaining(['-vf', 'scale=-2:720']));
    expect(args).toEqual(expect.arrayContaining(['-maxrate', '4000k']));
  });

  it('falls back to x264 when no encoder is supplied', () => {
    const variant = ladderFor(1080)[0]!;
    const args = buildSegmentArgs('/media/a.mkv', plan, variant, 0, 600);
    expect(args).toEqual(expect.arrayContaining(['-c:v', 'libx264', '-crf', String(variant.crf)]));
    expect(args).not.toContain('-forced-idr');
  });
});

describe('against the real ffmpeg on this machine', () => {
  it('agrees with ffmpeg about which encoders exist and work', async () => {
    const report = await detectHardware({});

    // Whatever this machine has, the report must be internally consistent:
    // nothing is called available unless its H.264 probe actually passed.
    for (const family of report.available) {
      const h264 = report.encoders.find((entry) => entry.family === family && entry.codec === 'h264');
      expect(h264).toMatchObject({ built: true, working: true });
    }
    expect(report.selected).toBe(report.available[0] ?? null);

    // And a working encoder must really produce a frame through the same path
    // playback uses, not merely have been listed.
    if (report.selected) {
      const choice = encoderFor(report.selected, 'h264')!;
      await expect(probeEncoder(choice)).resolves.toMatchObject({ working: true });
    } else {
      // No GPU here: software must still be able to encode, or the box is broken.
      await expect(execFileAsync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi',
        '-i', 'color=black:s=320x240:r=10:d=0.2', '-c:v', 'libx264', '-frames:v', '1', '-f', 'null', '-'],
      { timeout: 30_000 })).resolves.toBeDefined();
    }
  }, 120_000);
});
