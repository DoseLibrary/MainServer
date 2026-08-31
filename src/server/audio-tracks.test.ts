import { describe, expect, it } from 'vitest';
import { audioTracksOf, negotiatePlayback, type Probe } from './playback.ts';
import { buildTranscodeArgs } from './streaming.ts';

const capable = { containers: ['mp4', 'mov'], videoCodecs: ['h264'], audioCodecs: ['aac'] };

/** An mp4 with an English stereo track and a Swedish 5.1 dub. */
const dubbed: Probe = {
  format: { format_name: 'mov,mp4,m4a' },
  streams: [
    { codec_type: 'video', codec_name: 'h264', height: 1080 },
    { codec_type: 'audio', codec_name: 'aac', channels: 2, tags: { language: 'eng' }, disposition: { default: 1 } },
    { codec_type: 'audio', codec_name: 'aac', channels: 6, tags: { language: 'swe', title: 'Svenskt tal' } },
  ],
} as unknown as Probe;

describe('audio track discovery', () => {
  it('describes every audio stream with language, codec, and layout', () => {
    expect(audioTracksOf(dubbed)).toEqual([
      { index: 0, label: 'ENG · AAC · Stereo', language: 'eng', codec: 'aac', channels: 2, default: true },
      { index: 1, label: 'Svenskt tal · AAC · 5.1', language: 'swe', codec: 'aac', channels: 6, default: false },
    ]);
  });

  it('returns nothing for a file without audio', () => {
    expect(audioTracksOf({ format: {}, streams: [{ codec_type: 'video', codec_name: 'h264' }] } as unknown as Probe)).toEqual([]);
  });
});

describe('playing a chosen audio track', () => {
  it('direct plays the default track', () => {
    const plan = negotiatePlayback(dubbed, capable);
    expect(plan).toMatchObject({ mode: 'direct', audioTrackIndex: 0 });
  });

  it('repackages rather than re-encodes when another track is chosen', () => {
    const plan = negotiatePlayback(dubbed, capable, 1);
    // The codecs still match, so this costs a remux and not a transcode.
    expect(plan).toMatchObject({ mode: 'transcode', remux: true, audioTrackIndex: 1 });
    expect(plan.audio).toMatchObject({ action: 'copy' });
    expect(plan.reasons.join(' ')).toContain('no re-encode');
  });

  it('maps the chosen stream when ffmpeg runs', () => {
    const args = buildTranscodeArgs(negotiatePlayback(dubbed, capable, 1), '/media/Film.mp4');
    expect(args).toContain('0:a:1');
    expect(args).not.toContain('0:a:0');
  });

  it('falls back to the first track when the request is out of range', () => {
    expect(negotiatePlayback(dubbed, capable, 9)).toMatchObject({ audioTrackIndex: 1 });
    expect(negotiatePlayback(dubbed, capable, -3)).toMatchObject({ audioTrackIndex: 0, mode: 'direct' });
  });

  it('still transcodes an unsupported codec on the chosen track', () => {
    const mixed: Probe = {
      format: { format_name: 'matroska' },
      streams: [
        { codec_type: 'video', codec_name: 'h264', height: 1080 },
        { codec_type: 'audio', codec_name: 'aac', channels: 2 },
        { codec_type: 'audio', codec_name: 'truehd', channels: 8 },
      ],
    } as unknown as Probe;

    const plan = negotiatePlayback(mixed, capable, 1);
    expect(plan).toMatchObject({ mode: 'transcode', remux: false, audioTrackIndex: 1 });
    expect(plan.audio).toMatchObject({ action: 'transcode', codec: 'aac' });
  });
});
