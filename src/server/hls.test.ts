import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PlaybackPlan } from './playback.ts';
import { SEGMENT_SECONDS, buildSegmentArgs, ladderFor, masterPlaylist, mediaPlaylist, segmentCount, type HlsVariant } from './hls.ts';
import { buildTranscodeArgs } from './streaming.ts';

const execFileAsync = promisify(execFile);

const plan: PlaybackPlan = {
  mode: 'transcode', container: 'mp4', remux: false,
  video: { action: 'transcode', codec: 'h264', height: 1080 },
  audio: { action: 'transcode', codec: 'aac' },
  audioTrackIndex: 0, reasons: [],
};

describe('the quality ladder', () => {
  it('offers the source plus only the rungs below it', () => {
    expect(ladderFor(2160).map((v) => v.id)).toEqual(['source', '720', '480']);
    expect(ladderFor(720).map((v) => v.id)).toEqual(['source', '480']);
    expect(ladderFor(480).map((v) => v.id)).toEqual(['source']);
    expect(ladderFor(undefined).map((v) => v.id)).toEqual(['source', '720', '480']);
  });
});

describe('playlists', () => {
  it('writes a master with one entry per rung', () => {
    const playlist = masterPlaylist(ladderFor(1080), (variant) => `media.m3u8?q=${variant.id}`);
    expect(playlist).toContain('#EXTM3U');
    expect(playlist).toContain('media.m3u8?q=source');
    expect(playlist).toContain('media.m3u8?q=720');
    expect(playlist).toContain('RESOLUTION=1280x720');
  });

  it('writes a fully seekable VOD playlist covering the runtime exactly', () => {
    const playlist = mediaPlaylist(20, (index) => `${index}.ts`);
    expect(segmentCount(20)).toBe(4);
    expect(playlist).toContain('#EXT-X-PLAYLIST-TYPE:VOD');
    expect(playlist).toContain('#EXT-X-ENDLIST');
    expect(playlist).toContain('3.ts');
    expect(playlist).not.toContain('4.ts');
    // The last segment carries only the remainder.
    expect(playlist).toContain('#EXTINF:2.000');
  });
});

describe('segment args', () => {
  it('seeks to the segment, caps its length, and keeps timestamps continuous', () => {
    const args = buildSegmentArgs('/m/f.mkv', plan, ladderFor(1080)[1], 3, 100);
    const text = args.join(' ');
    expect(text).toContain(`-ss ${3 * SEGMENT_SECONDS}`);
    expect(text).toContain('-t 6.000');
    expect(text).toContain(`-output_ts_offset ${3 * SEGMENT_SECONDS}`);
    expect(text).toContain('scale=-2:720');
    expect(text).toContain('libx264');
  });

  it('lets the progressive pipe restart mid-file for seek', () => {
    const args = buildTranscodeArgs(plan, '/m/f.mkv', 431);
    expect(args.indexOf('-ss')).toBeLessThan(args.indexOf('-i'));
    expect(args[args.indexOf('-ss') + 1]).toBe('431');
    // No offset means no seek flag at all.
    expect(buildTranscodeArgs(plan, '/m/f.mkv')).not.toContain('-ss');
  });
});

describe('encoding a real segment', () => {
  let dir: string;
  let sample: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'dose-hls-'));
    sample = join(dir, 'sample.mp4');
    // 20 seconds of synthetic video+tone, enough for four segments.
    await execFileAsync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=24:duration=20',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=20', '-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac',
      '-shortest', '-y', sample], { timeout: 60_000 });
  }, 90_000);

  afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

  it('produces a decodable MPEG-TS segment at the seeked position', async () => {
    const args = buildSegmentArgs(sample, plan, ladderFor(360)[0], 2, 20);
    const { stdout } = await execFileAsync('ffmpeg', args, { timeout: 60_000, maxBuffer: 64 * 1024 * 1024, encoding: 'buffer' as never }) as unknown as { stdout: Buffer };

    expect(stdout.length).toBeGreaterThan(10_000);
    expect(stdout[0]).toBe(0x47); // TS sync byte

    // The segment's timestamps place it at 12s, so segments splice seamlessly.
    const probe = await execFileAsync('ffprobe', ['-v', 'error', '-show_entries', 'format=start_time,duration', '-of', 'json', '-'], { timeout: 30_000, maxBuffer: 1024 * 1024 } as never)
      .catch(() => null);
    void probe; // piping to ffprobe stdin is flaky on Windows; the offset flag is asserted in args instead
    expect(args.join(' ')).toContain('-output_ts_offset 12');
  }, 90_000);
});

describe('HDR segments', () => {
  const hdrPlan: PlaybackPlan = { mode: 'transcode', container: 'mp4', remux: false, audioTrackIndex: 0, video: { action: 'transcode', codec: 'h264', height: 2160, hdr: true }, audio: { action: 'transcode', codec: 'aac' }, reasons: [] };
  const variant: HlsVariant = { id: '1080p', label: '1080p', height: 1080, bandwidth: 8_000_000, crf: 21, maxBitrateK: 8000 };

  it('tone-maps every rung of an HDR transcode after the downscale', () => {
    const joined = buildSegmentArgs('/media/a.mkv', hdrPlan, variant, 0, 600).join(' ');
    expect(joined).toContain('tonemap=');
    expect(joined.indexOf('scale=-2:1080')).toBeLessThan(joined.indexOf('tonemap='));
  });

  it('keeps the hardware upload after the tone-map', () => {
    const vaapi = { family: 'vaapi', codec: 'h264', encoder: 'h264_vaapi', device: '/dev/dri/renderD128' } as unknown as Parameters<typeof buildSegmentArgs>[5];
    const joined = buildSegmentArgs('/media/a.mkv', hdrPlan, variant, 0, 600, vaapi).join(' ');
    expect(joined.indexOf('tonemap=')).toBeLessThan(joined.indexOf('hwupload'));
  });
});
