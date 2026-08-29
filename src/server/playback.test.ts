import { describe, expect, it } from 'vitest';
import { negotiatePlayback, type ClientCapabilities, type Probe } from './playback.ts';

const capable: ClientCapabilities = {
  containers: ['mp4', 'webm'],
  videoCodecs: ['h264', 'vp9'],
  audioCodecs: ['aac', 'opus'],
  maxHeight: 1080,
};

const h264Mp4: Probe = {
  format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2' },
  streams: [
    { codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080 },
    { codec_type: 'audio', codec_name: 'aac', channels: 6 },
  ],
};

describe('negotiatePlayback', () => {
  it('direct plays a fully compatible source', () => {
    const plan = negotiatePlayback(h264Mp4, capable);
    expect(plan.mode).toBe('direct');
    expect(plan.remux).toBe(false);
    expect(plan.video).toEqual({ action: 'copy', codec: 'h264', height: 1080 });
    expect(plan.audio).toEqual({ action: 'copy', codec: 'aac' });
  });

  it('transcodes only the incompatible audio track (per-track direct-stream)', () => {
    const probe: Probe = {
      format: { format_name: 'mov,mp4' },
      streams: [
        { codec_type: 'video', codec_name: 'h264', height: 1080 },
        { codec_type: 'audio', codec_name: 'ac3', channels: 6 },
      ],
    };
    const plan = negotiatePlayback(probe, capable);
    expect(plan.mode).toBe('transcode');
    expect(plan.video).toEqual({ action: 'copy', codec: 'h264', height: 1080 });
    expect(plan.audio).toEqual({ action: 'transcode', codec: 'aac' });
  });

  it('remuxes when both tracks copy but the container is unsupported', () => {
    const probe: Probe = {
      format: { format_name: 'matroska,webm' },
      streams: [
        { codec_type: 'video', codec_name: 'h264', height: 720 },
        { codec_type: 'audio', codec_name: 'aac' },
      ],
    };
    const plan = negotiatePlayback(probe, { containers: ['mp4'], videoCodecs: ['h264'], audioCodecs: ['aac'] });
    expect(plan.mode).toBe('transcode');
    expect(plan.remux).toBe(true);
    expect(plan.video?.action).toBe('copy');
    expect(plan.audio?.action).toBe('copy');
    expect(plan.container).toBe('mp4');
  });

  it('downscales video that exceeds the client height ceiling', () => {
    const probe: Probe = {
      format: { format_name: 'mov,mp4' },
      streams: [
        { codec_type: 'video', codec_name: 'h264', height: 2160 },
        { codec_type: 'audio', codec_name: 'aac' },
      ],
    };
    const plan = negotiatePlayback(probe, capable);
    expect(plan.video).toEqual({ action: 'transcode', codec: 'h264', height: 1080 });
  });

  it('infers stream type when codec_type is absent', () => {
    const probe: Probe = {
      format: { format_name: 'mp4' },
      streams: [
        { codec_name: 'hevc', width: 3840, height: 2160 },
        { codec_name: 'aac', channels: 2 },
      ],
    };
    const plan = negotiatePlayback(probe, capable);
    expect(plan.video?.action).toBe('transcode');
    expect(plan.video?.codec).toBe('h264');
    expect(plan.audio?.action).toBe('copy');
  });
});
