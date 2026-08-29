import { basename, extname, normalize } from 'node:path';

export type ParsedMedia = { type: 'movie'; title: string; year?: number; key: string } | { type: 'episode'; series: string; season: number; episode: number; title: string; key: string };

const RELEASE_NOISE = /(?:^|\s)(?:2160p|1080[pi]|720p|576p|480p|4k|uhd|bluray|blu-ray|bdrip|brrip|web[ -]?dl|webrip|hdtv|dvdrip|remux|x26[45]|h\.?26[45]|hevc|av1|hdr10\+?|hdr|dolby[ ._-]?vision|dovi|proper|repack|extended|unrated)(?:\s|$)/i;

/** Turn release-name separators into spaces without removing real title punctuation. */
const cleanTitle = (value: string) => value
  .replace(/[._]+/g, ' ')
  .replace(/\s+/g, ' ')
  .replace(/^[\s-]+|[\s-]+$/g, '')
  .trim();

/** Remove codec/source tags only after the title identity has been extracted. */
const removeReleaseNoise = (value: string) => {
  const cleaned = cleanTitle(value);
  const noise = RELEASE_NOISE.exec(cleaned);
  return cleanTitle(noise ? cleaned.slice(0, noise.index) : cleaned);
};

const pathParts = (path: string) => path.split(/[\\/]+/u).filter(Boolean);

/** Produce natural-key text without depending on the host's configured locale. */
const normalizeKeyPart = (value: string) => value.normalize('NFKC').toLowerCase();

const findLastSeasonFolderIndex = (parts: string[]) => {
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    if (/^season[\s._-]*\d{1,2}$/iu.test(parts[index])) return index;
  }
  return -1;
};

const validEpisodeNumbers = (season: number, episode: number) => Number.isInteger(season) && season >= 0 && Number.isInteger(episode) && episode > 0;

export function parseMediaPath(relativePath: string, kind: 'movies' | 'shows'): ParsedMedia | null {
  try {
    if (typeof relativePath !== 'string' || relativePath.trim() === '') return null;

    const path = normalize(relativePath);
    const stem = basename(path, extname(path));

    if (kind === 'movies') {
      // Require separators around the year so digits belonging to a title are not
      // mistaken for a release year. Brackets and parentheses are separators too.
      const match = /^(.*?)(?:[\s._[(]+)((?:19|20)\d{2})(?=$|[\s._)\]-])/u.exec(stem);
      const title = removeReleaseNoise(match?.[1] ?? stem);
      if (!title) return null;
      const year = match?.[2] ? Number(match[2]) : undefined;
      return { type: 'movie', title, year, key: `movie:${normalizeKeyPart(title)}:${year ?? ''}` };
    }

    const parts = pathParts(path);
    const parentParts = parts.slice(0, -1);
    let seriesSource = '';
    let season: number;
    let episode: number;
    let episodeTitle = '';

    // Keep the marker explicit. This prevents an unrelated number in a show name
    // from silently becoming an episode identity.
    const marked = /^(.*?)[\s._-]*(?:s(\d{1,2})e(\d{1,3})|(\d{1,2})x(\d{1,3}))(?=$|[\s._-])(?:[\s._-]+(.*))?$/iu.exec(stem);
    if (marked) {
      seriesSource = marked[1] ?? '';
      season = Number(marked[2] ?? marked[4]);
      episode = Number(marked[3] ?? marked[5]);
      episodeTitle = marked[6] ?? '';
    } else {
      const seasonFolderIndex = findLastSeasonFolderIndex(parentParts);
      if (seasonFolderIndex < 0) return null;
      const folderMatch = /^season[\s._-]*(\d{1,2})$/iu.exec(parentParts[seasonFolderIndex]);
      const numbered = /^(\d{1,3})(?=$|[\s._-])(?:[\s._-]+(.*))?$/u.exec(stem);
      if (!folderMatch || !numbered) return null;
      season = Number(folderMatch[1]);
      episode = Number(numbered[1]);
      episodeTitle = numbered[2] ?? '';
      seriesSource = parentParts[seasonFolderIndex - 1] ?? '';
    }

    if (!validEpisodeNumbers(season, episode)) return null;

    const seasonFolderIndex = findLastSeasonFolderIndex(parentParts);
    const folderSeries = seasonFolderIndex > 0 ? parentParts[seasonFolderIndex - 1] : parentParts[parentParts.length - 1];
    const series = cleanTitle(seriesSource || folderSeries || 'Unknown Series');
    if (!series) return null;
    const title = removeReleaseNoise(episodeTitle) || `Episode ${episode}`;
    return { type: 'episode', series, season, episode, title, key: `episode:${normalizeKeyPart(series)}:${season}:${episode}` };
  } catch {
    // Scanning should isolate malformed path input rather than abort a library.
    return null;
  }
}

export const VIDEO_EXTENSIONS = new Set(['.mkv', '.mp4', '.m4v', '.avi', '.mov', '.webm', '.ts', '.mpeg', '.mpg']);
