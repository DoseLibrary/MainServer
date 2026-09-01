/**
 * Subtitle alignment.
 *
 * A downloaded subtitle is usually right about *what* is said and wrong about
 * *when*. Two faults dominate: a constant offset (the release has a different
 * intro length) and a linear drift (the subtitle was timed against a 25fps PAL
 * transfer while the file runs at 23.976fps, or the reverse).
 *
 * Both are recoverable without understanding a word: turn the audio into a
 * speech/silence mask, turn the subtitle's cue times into the same kind of
 * mask, and find the shift — and stretch — that makes them agree.
 */

export interface Cue {
  startMs: number;
  endMs: number;
  text: string;
  /** Cue settings from the source file (position, alignment), preserved verbatim. */
  settings?: string;
}

export interface Alignment {
  offsetMs: number;
  /** Time scale applied before the offset; 1 means no framerate correction. */
  scale: number;
  /** Agreement between the masks, 0..1. Low means the match is not trustworthy. */
  confidence: number;
}

/** Resolution of the comparison. Coarse enough to be cheap, fine enough to matter. */
export const BIN_MS = 40;

/**
 * Framerate ratios behind the classic PAL/NTSC drift. A subtitle timed against
 * one transfer runs fast or slow against the other by exactly these factors.
 */
export const FRAMERATE_SCALES = [
  1,
  25 / 24,
  24 / 25,
  25 / (24000 / 1001),
  (24000 / 1001) / 25,
  30 / (30000 / 1001),
  (30000 / 1001) / 30,
];

/** How much better a stretched fit must score before it beats a plain shift. */
const STRETCH_MARGIN = 0.03;

const TIMESTAMP = /(\d{1,2}):(\d{2}):(\d{2})[.,](\d{1,3})/;

function toMs(hours: string, minutes: string, seconds: string, fraction: string): number {
  return (Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)) * 1000 + Number(fraction.padEnd(3, '0'));
}

/** Parse WebVTT or SubRip. Both are cue blocks; only the header and the
 * decimal separator differ, so one reader covers the formats subtitles arrive in. */
export function parseSubtitles(source: string): Cue[] {
  const text = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const cues: Cue[] = [];
  for (const block of text.split(/\n{2,}/)) {
    const lines = block.split('\n').filter((line) => line.trim().length > 0);
    if (lines.length === 0) continue;
    const arrowIndex = lines.findIndex((line) => line.includes('-->'));
    if (arrowIndex < 0) continue;
    const [from, to] = lines[arrowIndex].split('-->');
    const start = TIMESTAMP.exec(from ?? '');
    const end = TIMESTAMP.exec(to ?? '');
    if (!start || !end) continue;
    // Anything after the end timestamp is cue settings (line/position/align).
    const settings = (to ?? '').slice((end.index ?? 0) + end[0].length).trim();
    const body = lines.slice(arrowIndex + 1).join('\n');
    if (!body) continue;
    cues.push({
      startMs: toMs(start[1], start[2], start[3], start[4]),
      endMs: toMs(end[1], end[2], end[3], end[4]),
      text: body,
      settings: settings || undefined,
    });
  }
  return cues.sort((a, b) => a.startMs - b.startMs);
}

function stamp(ms: number): string {
  const clamped = Math.max(0, Math.round(ms));
  const hours = Math.floor(clamped / 3_600_000);
  const minutes = Math.floor((clamped % 3_600_000) / 60_000);
  const seconds = Math.floor((clamped % 60_000) / 1000);
  const millis = clamped % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

export function serializeVtt(cues: Cue[]): string {
  const blocks = cues.map((cue) => {
    const timing = `${stamp(cue.startMs)} --> ${stamp(cue.endMs)}${cue.settings ? ` ${cue.settings}` : ''}`;
    return `${timing}\n${cue.text}`;
  });
  return `WEBVTT\n\n${blocks.join('\n\n')}\n`;
}

/** Apply a stretch and a shift, dropping anything pushed before zero. */
export function applyAlignment(cues: Cue[], alignment: Pick<Alignment, 'offsetMs' | 'scale'>): Cue[] {
  return cues
    .map((cue) => ({
      ...cue,
      startMs: cue.startMs * alignment.scale + alignment.offsetMs,
      endMs: cue.endMs * alignment.scale + alignment.offsetMs,
    }))
    .filter((cue) => cue.endMs > 0)
    .map((cue) => ({ ...cue, startMs: Math.max(0, cue.startMs) }));
}

/**
 * Speech mask from mono PCM: a bin is speech when its energy stands above the
 * recording's own noise floor. An absolute threshold would fail on quiet mixes,
 * so the floor is taken from the quiet end of the distribution.
 */
export function speechMask(pcm: Int16Array, sampleRate: number, binMs = BIN_MS): Uint8Array {
  const samplesPerBin = Math.max(1, Math.round((sampleRate * binMs) / 1000));
  const bins = Math.floor(pcm.length / samplesPerBin);
  const energy = new Float64Array(bins);
  for (let bin = 0; bin < bins; bin++) {
    let sum = 0;
    for (let i = bin * samplesPerBin; i < (bin + 1) * samplesPerBin; i++) sum += pcm[i] * pcm[i];
    energy[bin] = Math.sqrt(sum / samplesPerBin);
  }
  if (bins === 0) return new Uint8Array(0);
  const sorted = Float64Array.from(energy).sort();
  const floor = sorted[Math.floor(bins * 0.2)];
  const loud = sorted[Math.floor(bins * 0.95)];
  // A flat track (silence, or a tone) carries no alignment information.
  if (!(loud > floor)) return new Uint8Array(bins);
  const threshold = floor + (loud - floor) * 0.25;
  const mask = new Uint8Array(bins);
  for (let bin = 0; bin < bins; bin++) mask[bin] = energy[bin] >= threshold ? 1 : 0;
  return mask;
}

/** The same kind of mask, built from when the subtitle says someone is talking. */
export function cueMask(cues: Cue[], bins: number, binMs = BIN_MS): Uint8Array {
  const mask = new Uint8Array(bins);
  for (const cue of cues) {
    const from = Math.max(0, Math.floor(cue.startMs / binMs));
    const to = Math.min(bins - 1, Math.ceil(cue.endMs / binMs));
    for (let bin = from; bin <= to; bin++) mask[bin] = 1;
  }
  return mask;
}

/** Agreement of two masks at one shift, scored so that neither all-on nor
 * all-off masks can win by covering everything. */
function score(subtitle: Uint8Array, speech: Uint8Array, shiftBins: number): number {
  let overlap = 0;
  let subtitleOn = 0;
  let speechOn = 0;
  for (let bin = 0; bin < subtitle.length; bin++) {
    const shifted = bin + shiftBins;
    if (shifted < 0 || shifted >= speech.length) continue;
    if (subtitle[bin]) subtitleOn++;
    if (speech[shifted]) speechOn++;
    if (subtitle[bin] && speech[shifted]) overlap++;
  }
  if (subtitleOn === 0 || speechOn === 0) return 0;
  // Dice coefficient: rewards matching speech, punishes covering silence.
  return (2 * overlap) / (subtitleOn + speechOn);
}

export interface AlignmentOptions {
  maxOffsetMs?: number;
  binMs?: number;
  /** Try the PAL/NTSC stretches as well as a plain shift. */
  correctFramerate?: boolean;
}

/**
 * Find the shift (and optional stretch) that best lines a subtitle up with the
 * audio. Returns the identity alignment with zero confidence when there is
 * nothing to match against.
 */
export function findAlignment(cues: Cue[], speech: Uint8Array, options: AlignmentOptions = {}): Alignment {
  const binMs = options.binMs ?? BIN_MS;
  const maxShift = Math.round((options.maxOffsetMs ?? 120_000) / binMs);
  const scales = options.correctFramerate === false ? [1] : FRAMERATE_SCALES;
  if (cues.length === 0 || speech.length === 0) return { offsetMs: 0, scale: 1, confidence: 0 };

  let best: Alignment = { offsetMs: 0, scale: 1, confidence: 0 };
  for (const scale of scales) {
    const scaled = scale === 1 ? cues : cues.map((cue) => ({ ...cue, startMs: cue.startMs * scale, endMs: cue.endMs * scale }));
    const mask = cueMask(scaled, speech.length + maxShift, binMs);
    // Stretching is the bigger claim, so it has to beat a plain shift by a
    // margin; otherwise noise would talk us into a framerate fix that is not real.
    const required = scale === 1 ? best.confidence : best.confidence + STRETCH_MARGIN;
    let bestForScale: Alignment | null = null;
    for (let shift = -maxShift; shift <= maxShift; shift++) {
      const value = score(mask, speech, shift);
      if (value > (bestForScale?.confidence ?? required)) bestForScale = { offsetMs: shift * binMs, scale, confidence: value };
    }
    if (bestForScale && bestForScale.confidence > required) best = bestForScale;
  }
  return best;
}
