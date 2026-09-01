import { describe, expect, it } from 'vitest';
import { parseRangeHeader, rangeHeaders } from './range.ts';

describe('range requests for a stored file', () => {
  it('serves the whole file when nothing is asked for', () => {
    expect(parseRangeHeader(undefined, 1000)).toEqual({ start: 0, end: 999, length: 1000, satisfiable: true });
    expect(parseRangeHeader('', 1000).length).toBe(1000);
  });

  it('serves an explicit window', () => {
    expect(parseRangeHeader('bytes=100-199', 1000)).toEqual({ start: 100, end: 199, length: 100, satisfiable: true });
  });

  it('serves an open-ended request to the end of the file', () => {
    expect(parseRangeHeader('bytes=900-', 1000)).toEqual({ start: 900, end: 999, length: 100, satisfiable: true });
  });

  it('serves a suffix range, which is how a player finds the moov atom', () => {
    expect(parseRangeHeader('bytes=-500', 1000)).toEqual({ start: 500, end: 999, length: 500, satisfiable: true });
  });

  it('clamps a window that runs past the end', () => {
    expect(parseRangeHeader('bytes=800-5000', 1000)).toMatchObject({ start: 800, end: 999, length: 200 });
  });

  it('refuses a window that starts past the end, or is inside out', () => {
    expect(parseRangeHeader('bytes=2000-3000', 1000).satisfiable).toBe(false);
    expect(parseRangeHeader('bytes=500-100', 1000).satisfiable).toBe(false);
    expect(parseRangeHeader('bytes=-0', 1000).satisfiable).toBe(false);
  });

  it('ignores a header it cannot read rather than failing playback', () => {
    expect(parseRangeHeader('bytes=abc', 1000).length).toBe(1000);
    expect(parseRangeHeader('items=0-10', 1000).length).toBe(1000);
  });

  it('describes the partial response the way a player expects', () => {
    const headers = rangeHeaders(parseRangeHeader('bytes=100-199', 1000), 1000, 'video/mp4');

    expect(headers).toMatchObject({
      'Content-Type': 'video/mp4',
      'Content-Length': '100',
      'Content-Range': 'bytes 100-199/1000',
      'Accept-Ranges': 'bytes',
    });
  });
});
