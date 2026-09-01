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

/** A folder that names a season: `Season 1`, `Season 01`, British `Series 3`, or short `S01`. */
const SEASON_FOLDER = /^(?:season|series|s)[\s._-]*(\d{1,2})$/iu;

/** A stem that unambiguously identifies an episode, regardless of library kind. */
const INLINE_EPISODE = /(?:\bs\d{1,2}[\s._-]*e\d{1,3}\b|\b\d{1,2}x\d{1,3}\b)/iu;

/** True when a path clearly belongs to a TV episode (inline marker or season-folder ancestor). */
const looksLikeEpisode = (stem: string, parts: string[]) =>
  INLINE_EPISODE.test(stem) || parts.slice(0, -1).some((part) => SEASON_FOLDER.test(part));

const findLastSeasonFolderIndex = (parts: string[]) => {
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    if (SEASON_FOLDER.test(parts[index])) return index;
  }
  return -1;
};

const validEpisodeNumbers = (season: number, episode: number) => Number.isInteger(season) && season >= 0 && Number.isInteger(episode) && episode > 0;

/**
 * Bonus material that lives beside a title: `Movie-trailer.mp4`, the
 * `Movie_downloaded_trailer.mp4` a trailer downloader leaves behind, or anything
 * under an `Extras`/`Trailers` folder. These are not titles of their own; a
 * library that imports them shows posterless ghosts next to the real film.
 */
const EXTRAS_TOKENS = 'trailer|teaser|sample|clip|featurette|interview|short|other|extra|bonus|blooper|outtake|gag[ ._-]?reel|making[ ._-]?of|deleted([ ._-]?scene)?|behind[ ._-]?the[ ._-]?scenes';
const EXTRAS_SUFFIX = new RegExp(`(?:^|[._-])(?:${EXTRAS_TOKENS})s?$`, 'iu');
const EXTRAS_FOLDER = new RegExp(`^(?:${EXTRAS_TOKENS}|extras|trailers|featurettes|interviews|scenes|shorts|others|deleted[ ._-]?scenes|samples)$`, 'iu');

/** True when a path is bonus material rather than a title of its own. */
export function isExtrasPath(relativePath: string): boolean {
  if (typeof relativePath !== 'string' || relativePath.trim() === '') return false;
  const path = normalize(relativePath);
  const parts = pathParts(path);
  return EXTRAS_SUFFIX.test(basename(path, extname(path))) || parts.slice(0, -1).some((part) => EXTRAS_FOLDER.test(part));
}

export function parseMediaPath(relativePath: string, kind: 'movies' | 'shows'): ParsedMedia | null {
  try {
    if (typeof relativePath !== 'string' || relativePath.trim() === '') return null;

    const path = normalize(relativePath);
    const stem = basename(path, extname(path));
    // Bonus material never becomes a title of its own, in either library kind.
    if (isExtrasPath(path)) return null;

    if (kind === 'movies') {
      // A file that clearly identifies as an episode does not belong in a movies
      // library. Skip it rather than importing a bogus movie — this is a common
      // cause of shows appearing as movies when a library is mistyped.
      if (looksLikeEpisode(stem, pathParts(path))) return null;
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
    // from silently becoming an episode identity. A separator is allowed between
    // the season and episode markers (`S01.E01`), and trailing markers from a
    // multi-episode file (`S01E01-E02`, `S01E01E02`) are consumed but only the
    // first episode identifies the file.
    const marked = /^(.*?)[\s._-]*(?:s(\d{1,2})[\s._-]*e(\d{1,3})(?:[\s._-]*-?[\s._-]*e\d{1,3})*|(\d{1,2})x(\d{1,3}))(?=$|[\s._-])(?:[\s._-]+(.*))?$/iu.exec(stem);
    if (marked) {
      seriesSource = marked[1] ?? '';
      season = Number(marked[2] ?? marked[4]);
      episode = Number(marked[3] ?? marked[5]);
      episodeTitle = marked[6] ?? '';
    } else {
      const seasonFolderIndex = findLastSeasonFolderIndex(parentParts);
      if (seasonFolderIndex < 0) return null;
      const folderMatch = SEASON_FOLDER.exec(parentParts[seasonFolderIndex]);
      // A season-folder episode file: a bare number (`04 - Title`) or an explicit
      // `Episode 4` / `Ep 4` / `E4` prefix.
      const numbered = /^(?:(?:episode|ep|e)[\s._-]*)?(\d{1,3})(?=$|[\s._-])(?:[\s._-]+(.*))?$/iu.exec(stem);
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
