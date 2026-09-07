import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectMediaCapabilities } from './media-capabilities';

/** Pretend to be a browser that answers `canPlayType` from a fixed table. */
function browserThatPlays(table: Record<string, string>) {
  vi.spyOn(document, 'createElement').mockImplementation(() => ({ canPlayType: (mime: string) => table[mime] ?? '' }) as unknown as HTMLVideoElement);
}

afterEach(() => { vi.restoreAllMocks(); });

describe('detectMediaCapabilities', () => {
  it('advertises hevc from a full codec string, since a bare hvc1 is refused by Chromium', () => {
    browserThatPlays({ 'video/mp4': 'maybe', 'video/mp4; codecs="hvc1.1.6.L120.90"': 'probably' });
    expect(detectMediaCapabilities().videoCodecs).toContain('hevc');
  });

  it('advertises matroska only when the browser demuxes it', () => {
    browserThatPlays({ 'video/mp4': 'maybe', 'video/x-matroska': 'maybe' });
    expect(detectMediaCapabilities().containers).toEqual(['mp4', 'mov', 'matroska']);
    browserThatPlays({ 'video/mp4': 'maybe', 'video/webm': 'probably' });
    expect(detectMediaCapabilities().containers).toEqual(['mp4', 'mov', 'webm']);
  });

  it('probes the surround and lossless audio codecs libraries actually carry', () => {
    browserThatPlays({ 'video/mp4': 'maybe', 'audio/mp4; codecs="ac-3"': 'probably', 'audio/mp4; codecs="ec-3"': 'probably', 'audio/flac': 'probably' });
    expect(detectMediaCapabilities().audioCodecs).toEqual(['ac3', 'eac3', 'flac']);
  });
});
