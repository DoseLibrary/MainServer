import { describe, expect, it } from 'vitest';
import {
  applyAlignment, BIN_MS, cueMask, findAlignment, parseSubtitles, serializeVtt, speechMask, type Cue,
} from './subtitle-sync.ts';

const SAMPLE_RATE = 5512;

/** Speech in the given second-ranges, silence elsewhere. */
function synthAudio(seconds: number, speech: Array<[number, number]>): Int16Array {
  const pcm = new Int16Array(Math.floor(seconds * SAMPLE_RATE));
  let state = 12345;
  const random = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 0xffffffff; };
  for (const [from, to] of speech) {
    for (let i = Math.floor(from * SAMPLE_RATE); i < Math.min(pcm.length, Math.floor(to * SAMPLE_RATE)); i++) {
      pcm[i] = Math.round((random() * 2 - 1) * 12000);
    }
  }
  // A quiet noise floor everywhere, as in any real recording.
  for (let i = 0; i < pcm.length; i++) pcm[i] += Math.round((random() * 2 - 1) * 60);
  return pcm;
}

function cuesFor(speech: Array<[number, number]>, offsetSeconds = 0, scale = 1): Cue[] {
  return speech.map(([from, to], index) => ({
    startMs: (from * scale + offsetSeconds) * 1000,
    endMs: (to * scale + offsetSeconds) * 1000,
    text: `Line ${index + 1}`,
  }));
}

const DIALOGUE: Array<[number, number]> = [
  [2, 5], [7, 9], [12, 16], [19, 21], [24, 28], [31, 33], [36, 40], [44, 47], [50, 54], [58, 61],
];

describe('reading and writing subtitle files', () => {
  it('reads SubRip, keeping its text and comma-separated milliseconds', () => {
    const cues = parseSubtitles('1\n00:00:02,500 --> 00:00:05,000\nHello there\nsecond line\n\n2\n00:01:00,000 --> 00:01:02,250\nGeneral Kenobi\n');
    expect(cues).toEqual([
      { startMs: 2500, endMs: 5000, text: 'Hello there\nsecond line', settings: undefined },
      { startMs: 60_000, endMs: 62_250, text: 'General Kenobi', settings: undefined },
    ]);
  });

  it('reads WebVTT and preserves cue settings', () => {
    const cues = parseSubtitles('WEBVTT\n\n00:00:01.000 --> 00:00:02.000 line:90% align:center\nOn screen\n');
    expect(cues[0]).toMatchObject({ startMs: 1000, endMs: 2000, settings: 'line:90% align:center' });
  });

  it('round-trips through WebVTT', () => {
    const cues = parseSubtitles('WEBVTT\n\n00:00:01.500 --> 00:00:02.750 align:start\nText\n');
    expect(parseSubtitles(serializeVtt(cues))).toEqual(cues);
    expect(serializeVtt(cues).startsWith('WEBVTT')).toBe(true);
  });

  it('skips malformed blocks instead of failing the file', () => {
    expect(parseSubtitles('WEBVTT\n\nNOTE something\n\n00:00:01.000 --> 00:00:02.000\nKept\n')).toHaveLength(1);
  });
});

describe('shifting cues', () => {
  it('stretches then shifts, and drops what falls before the start', () => {
    const cues: Cue[] = [{ startMs: 1000, endMs: 2000, text: 'a' }, { startMs: 10_000, endMs: 11_000, text: 'b' }];
    // The first cue survives with its start clamped; only cues wholly before zero go.
    expect(applyAlignment(cues, { offsetMs: -1500, scale: 1 })).toEqual([
      { startMs: 0, endMs: 500, text: 'a', settings: undefined },
      { startMs: 8500, endMs: 9500, text: 'b', settings: undefined },
    ]);
    expect(applyAlignment(cues, { offsetMs: -3000, scale: 1 })).toEqual([{ startMs: 7000, endMs: 8000, text: 'b', settings: undefined }]);
    expect(applyAlignment(cues, { offsetMs: 0, scale: 2 })[0]).toMatchObject({ startMs: 2000, endMs: 4000 });
  });
});

describe('finding the alignment', () => {
  const speech = speechMask(synthAudio(65, DIALOGUE), SAMPLE_RATE);

  it('detects speech where the audio is loud', () => {
    // Second 3 is dialogue, second 6 is silence.
    expect(speech[Math.floor(3000 / BIN_MS)]).toBe(1);
    expect(speech[Math.floor(6000 / BIN_MS)]).toBe(0);
  });

  it('recognizes an already-synced subtitle without moving it', () => {
    const found = findAlignment(cuesFor(DIALOGUE), speech);
    expect(Math.abs(found.offsetMs)).toBeLessThanOrEqual(BIN_MS);
    expect(found.scale).toBe(1);
    expect(found.confidence).toBeGreaterThan(0.85);
  });

  it('recovers a constant offset in both directions', () => {
    const late = findAlignment(cuesFor(DIALOGUE, 8), speech);
    expect(late.offsetMs).toBeGreaterThan(-8500);
    expect(late.offsetMs).toBeLessThan(-7500);
    expect(late.confidence).toBeGreaterThan(0.85);

    const early = findAlignment(cuesFor(DIALOGUE, -4.5), speech);
    expect(early.offsetMs).toBeGreaterThan(4000);
    expect(early.offsetMs).toBeLessThan(5000);
  });

  it('recovers PAL/NTSC drift, which a constant shift cannot fix', () => {
    // Timed against a 25fps transfer, played back at 23.976fps.
    const drifted = cuesFor(DIALOGUE, 0, 25 / (24000 / 1001));
    const found = findAlignment(drifted, speech);

    expect(found.scale).toBeCloseTo((24000 / 1001) / 25, 2);
    expect(found.confidence).toBeGreaterThan(0.85);

    const fixed = applyAlignment(drifted, found);
    for (const [index, [from]] of DIALOGUE.entries()) {
      expect(Math.abs(fixed[index].startMs - from * 1000)).toBeLessThan(400);
    }
  });

  it('reports low confidence rather than inventing a fit for unrelated timings', () => {
    const unrelated: Cue[] = Array.from({ length: 10 }, (_, index) => ({ startMs: index * 500, endMs: index * 500 + 400, text: 'x' }));
    expect(findAlignment(unrelated, speech, { maxOffsetMs: 2000 }).confidence).toBeLessThan(0.7);
  });

  it('returns the identity when there is nothing to compare', () => {
    expect(findAlignment([], speech)).toEqual({ offsetMs: 0, scale: 1, confidence: 0 });
    expect(findAlignment(cuesFor(DIALOGUE), new Uint8Array(0))).toEqual({ offsetMs: 0, scale: 1, confidence: 0 });
    // Silence carries no information, so no alignment can be claimed.
    expect(speechMask(new Int16Array(SAMPLE_RATE * 5), SAMPLE_RATE).every((bin) => bin === 0)).toBe(true);
  });

  it('scores a subtitle that covers everything below a well-fitted one', () => {
    const blanket = cueMask([{ startMs: 0, endMs: 65_000, text: 'x' }], speech.length);
    expect(blanket.slice(0, 1600).every((bin) => bin === 1)).toBe(true);
    expect(findAlignment([{ startMs: 0, endMs: 65_000, text: 'x' }], speech, { maxOffsetMs: 1000 }).confidence)
      .toBeLessThan(findAlignment(cuesFor(DIALOGUE), speech, { maxOffsetMs: 1000 }).confidence);
    // A well-fitted subtitle leaves the silences alone.
    expect(cueMask(cuesFor(DIALOGUE), speech.length).some((bin) => bin === 0)).toBe(true);
  });
});
