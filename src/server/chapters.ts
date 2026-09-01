import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** A chapter as the player uses it: where it starts and what to call it. */
export interface Chapter {
  title: string;
  startSeconds: number;
  endSeconds: number;
}

interface ProbedChapter {
  start_time?: string | number;
  end_time?: string | number;
  tags?: { title?: string };
}

/**
 * Chapters out of an ffprobe result.
 *
 * Containers that carry chapters (MKV above all) report them with fractional
 * second timestamps and an optional title. Untitled chapters get "Chapter N",
 * and anything malformed is dropped rather than breaking the list.
 */
export function chaptersOf(probe: Record<string, unknown> | null | undefined): Chapter[] {
  const raw = (probe as { chapters?: ProbedChapter[] } | null | undefined)?.chapters;
  if (!Array.isArray(raw)) return [];
  const parsed: Array<{ title?: string; startSeconds: number; endSeconds: number }> = [];
  for (const entry of raw.slice(0, 500)) {
    const start = Number(entry?.start_time);
    const end = Number(entry?.end_time);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || start < 0) continue;
    const title = typeof entry.tags?.title === 'string' && entry.tags.title.trim().length > 0
      ? entry.tags.title.trim().slice(0, 200)
      : undefined;
    parsed.push({ title, startSeconds: start, endSeconds: end });
  }
  // Fallback numbering follows the timeline, not the container's storage order.
  return parsed
    .sort((a, b) => a.startSeconds - b.startSeconds)
    .map((chapter, index) => ({ ...chapter, title: chapter.title ?? `Chapter ${index + 1}` }));
}

/** Whether a stored probe has been asked about chapters at all. Files scanned
 * before chapters were probed lack the key entirely, and get one live look. */
export function probeKnowsChapters(probe: Record<string, unknown> | null | undefined): boolean {
  return probe != null && Object.prototype.hasOwnProperty.call(probe, 'chapters');
}

/** Read only the chapter atoms of a file — a header read, not a decode. */
export async function ffprobeChapters(absolutePath: string, timeoutMs = 15_000): Promise<ProbedChapter[]> {
  const { stdout } = await execFileAsync('ffprobe',
    ['-v', 'error', '-show_chapters', '-of', 'json', absolutePath],
    { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 });
  const parsed = JSON.parse(stdout) as { chapters?: ProbedChapter[] };
  return parsed.chapters ?? [];
}
