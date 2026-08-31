import { describe, expect, it } from 'vitest';
import { buildTranscodeArgs, contentTypeFor, decodePlaybackPlan, encodePlaybackPlan, resolveRange, resolveWithin } from './streaming.ts';
import type { PlaybackPlan } from './playback.ts';

describe('resolveRange', () => {
  it('serves the whole file without a range header', () => {
    expect(resolveRange(undefined, 1000)).toEqual({ status: 200, start: 0, end: 999, length: 1000 });
  });

  it('parses a bounded range', () => {
    expect(resolveRange('bytes=0-499', 1000)).toEqual({ status: 206, start: 0, end: 499, length: 500 });
  });

  it('parses an open-ended range and clamps the end', () => {
    expect(resolveRange('bytes=500-', 1000)).toEqual({ status: 206, start: 500, end: 999, length: 500 });
    expect(resolveRange('bytes=0-99999', 1000)).toEqual({ status: 206, start: 0, end: 999, length: 1000 });
  });

  it('parses a suffix range', () => {
    expect(resolveRange('bytes=-200', 1000)).toEqual({ status: 206, start: 800, end: 999, length: 200 });
  });

  it('rejects an unsatisfiable range', () => {
    expect(resolveRange('bytes=2000-3000', 1000).status).toBe(416);
  });
});

describe('resolveWithin', () => {
  it('resolves a nested path under the root', () => {
    expect(resolveWithin('/media/movies', 'Dune/Dune.mkv')).toBe(resolveWithin('/media/movies', 'Dune/Dune.mkv'));
    expect(resolveWithin('/media/movies', 'Dune/Dune.mkv')).toContain('Dune.mkv');
  });

  it('rejects traversal outside the root', () => {
    expect(resolveWithin('/media/movies', '../secrets/passwd')).toBeNull();
    expect(resolveWithin('/media/movies', '../../etc/passwd')).toBeNull();
  });
});

describe('contentTypeFor', () => {
  it('maps known extensions', () => {
    expect(contentTypeFor('a/b/Movie.mkv')).toBe('video/x-matroska');
    expect(contentTypeFor('Movie.mp4')).toBe('video/mp4');
    expect(contentTypeFor('Movie.unknown')).toBe('application/octet-stream');
  });
});

describe('buildTranscodeArgs', () => {
  it('copies a compatible video track and transcodes only audio', () => {
    const plan: PlaybackPlan = { mode: 'transcode', container: 'mp4', remux: false, audioTrackIndex: 0, video: { action: 'copy', codec: 'h264', height: 1080 }, audio: { action: 'transcode', codec: 'aac' }, reasons: [] };
    const args = buildTranscodeArgs(plan, '/media/a.mkv');
    expect(args).toContain('-i');
    expect(args.join(' ')).toContain('-c:v copy');
    expect(args.join(' ')).toContain('-c:a aac');
    expect(args.slice(-3)).toEqual(['-movflags', 'frag_keyframe+empty_moov+default_base_moof', 'pipe:1']);
  });

  it('encodes and downscales video that must be transcoded', () => {
    const plan: PlaybackPlan = { mode: 'transcode', container: 'mp4', remux: false, audioTrackIndex: 0, video: { action: 'transcode', codec: 'h264', height: 720 }, audio: { action: 'copy', codec: 'aac' }, reasons: [] };
    const joined = buildTranscodeArgs(plan, '/media/a.mkv').join(' ');
    expect(joined).toContain('-c:v libx264');
    expect(joined).toContain('scale=-2:720');
    expect(joined).toContain('-c:a copy');
  });
});

describe('playback plan transport', () => {
  it('round-trips a negotiated transcode plan', () => {
    const plan: PlaybackPlan = { mode: 'transcode', container: 'mp4', remux: false, audioTrackIndex: 0, video: { action: 'copy', codec: 'h264', height: 1080 }, audio: { action: 'transcode', codec: 'aac' }, reasons: ['audio unsupported'] };
    expect(decodePlaybackPlan(encodePlaybackPlan(plan))).toEqual(plan);
  });

  it('rejects malformed, direct, and unsupported-container plans', () => {
    expect(decodePlaybackPlan('not-base64-json')).toBeNull();
    expect(decodePlaybackPlan(encodePlaybackPlan({ mode: 'direct', container: 'mp4', remux: false, audioTrackIndex: 0, video: null, audio: null, reasons: [] }))).toBeNull();
    expect(decodePlaybackPlan(encodePlaybackPlan({ mode: 'transcode', container: 'webm', remux: true, audioTrackIndex: 0, video: null, audio: null, reasons: [] }))).toBeNull();
  });
});
