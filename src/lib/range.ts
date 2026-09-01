/**
 * Byte-range arithmetic for serving a stored file to a `<video>` element.
 *
 * Safari refuses to play a video from a plain `200`, so the offline path has to
 * answer `Range` requests properly. Keeping the arithmetic here — rather than
 * inside the service worker — means it can be tested without a worker at all.
 */

export interface ParsedRange {
  start: number;
  end: number;
  /** Inclusive length, as `Content-Length` wants it. */
  length: number;
  satisfiable: boolean;
}

/** Parse a `Range` header against a known size, RFC 7233 style. */
export function parseRangeHeader(header: string | null | undefined, size: number): ParsedRange {
  const whole: ParsedRange = { start: 0, end: Math.max(0, size - 1), length: size, satisfiable: true };
  if (!header) return whole;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return whole;
  const [, rawStart, rawEnd] = match;
  if (rawStart === '' && rawEnd === '') return whole;

  let start: number;
  let end: number;
  if (rawStart === '') {
    // Suffix range: the last N bytes, which players use to read the moov atom.
    const suffix = Number(rawEnd);
    if (suffix <= 0) return { start: 0, end: 0, length: 0, satisfiable: false };
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === '' ? size - 1 : Math.min(Number(rawEnd), size - 1);
  }
  if (start > end || start >= size) return { start: 0, end: 0, length: 0, satisfiable: false };
  return { start, end, length: end - start + 1, satisfiable: true };
}

/** Headers for a partial response over a file of `size` bytes. */
export function rangeHeaders(range: ParsedRange, size: number, contentType: string): Record<string, string> {
  return {
    'Content-Type': contentType,
    'Content-Length': String(range.length),
    'Content-Range': `bytes ${range.start}-${range.end}/${size}`,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
  };
}
