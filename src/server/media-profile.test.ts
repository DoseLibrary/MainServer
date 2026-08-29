import { describe, expect, it } from 'vitest';
import { channelLayout, deriveTechnicalProfile, dynamicRange, resolutionLabel, type Probe } from './media-profile.ts';

describe('resolutionLabel', () => {
  it('maps heights to labels', () => {
    expect(resolutionLabel(2160)).toBe('4K');
    expect(resolutionLabel(1080)).toBe('1080p');
    expect(resolutionLabel(720)).toBe('720p');
    expect(resolutionLabel(480)).toBe('480p');
    expect(resolutionLabel(240)).toBe('SD');
    expect(resolutionLabel(null)).toBeNull();
  });
});

describe('channelLayout', () => {
  it('names common layouts', () => {
    expect(channelLayout(2)).toBe('Stereo');
    expect(channelLayout(6)).toBe('5.1');
    expect(channelLayout(8)).toBe('7.1');
    expect(channelLayout(3)).toBe('3 ch');
    expect(channelLayout(0)).toBeNull();
  });
});

describe('dynamicRange', () => {
  it('detects HDR flavours and defaults to SDR', () => {
    expect(dynamicRange({ color_transfer: 'smpte2084' })).toBe('HDR10');
    expect(dynamicRange({ color_transfer: 'arib-std-b67' })).toBe('HLG');
    expect(dynamicRange({ codec_name: 'h264' })).toBe('SDR');
    expect(dynamicRange(undefined)).toBeNull();
  });
});

describe('deriveTechnicalProfile', () => {
  it('summarises a 4K HDR file', () => {
    const probe: Probe = {
      format: { format_name: 'mov,mp4', bit_rate: '20000000' },
      streams: [
        { codec_type: 'video', codec_name: 'hevc', width: 3840, height: 2160, color_transfer: 'smpte2084' },
        { codec_type: 'audio', codec_name: 'eac3', channels: 6 },
      ],
    };
    expect(deriveTechnicalProfile(probe)).toMatchObject({
      resolutionLabel: '4K',
      width: 3840,
      height: 2160,
      videoCodec: 'hevc',
      audioCodec: 'eac3',
      audioChannels: '5.1',
      dynamicRange: 'HDR10',
      bitrate: 20000000,
    });
  });

  it('degrades gracefully on an empty probe', () => {
    const profile = deriveTechnicalProfile({});
    expect(profile.resolutionLabel).toBeNull();
    expect(profile.videoCodec).toBeNull();
    expect(profile.dynamicRange).toBeNull();
  });
});
