import { describe, expect, it } from 'vitest';
import { parseMediaPath } from './media-parser.ts';

describe('parseMediaPath', () => {
  it.each([
    ['The.Matrix.1999.1080p.BluRay.mkv', 'The Matrix', 1999],
    ['Amélie (2001).mkv', 'Amélie', 2001],
    ['Spider-Man.No.Way.Home.2021.2160p.mkv', 'Spider-Man No Way Home', 2021],
  ])('parses movie release name %s', (path, title, year) => {
    expect(parseMediaPath(path, 'movies')).toEqual({ type: 'movie', title, year, key: `movie:${title.normalize('NFKC').toLowerCase()}:${year}` });
  });

  it('strips common release noise when a movie has no year', () => {
    expect(parseMediaPath('Arrival.1080p.BluRay.x265.mkv', 'movies')).toMatchObject({ title: 'Arrival', year: undefined });
  });

  it.each([
    ['Show.Name.S01E02.Episode.Title.mkv', 'Show Name', 1, 2, 'Episode Title'],
    ['Show Name 1x02 Episode Title.mkv', 'Show Name', 1, 2, 'Episode Title'],
    ['Show.Name.s02e003.finalE.mkv', 'Show Name', 2, 3, 'finalE'],
    ['Show.Name.S03e04.mkv', 'Show Name', 3, 4, 'Episode 4'],
  ])('parses marked episode %s', (path, series, season, episode, title) => {
    expect(parseMediaPath(path, 'shows')).toEqual({
      type: 'episode', series, season, episode, title,
      key: `episode:${series.normalize('NFKC').toLowerCase()}:${season}:${episode}`,
    });
  });

  it('derives the series and season from a season folder', () => {
    expect(parseMediaPath('Show Name/Season 03/04 - Episode Title.mkv', 'shows')).toEqual({
      type: 'episode', series: 'Show Name', season: 3, episode: 4, title: 'Episode Title',
      key: 'episode:show name:3:4',
    });
  });

  it('uses Unicode-normalized, locale-independent natural keys', () => {
    expect(parseMediaPath('\u212bngstr\u00f6m (2020).mkv', 'movies')).toMatchObject({
      key: 'movie:\u00e5ngstr\u00f6m:2020',
    });
    expect(parseMediaPath('\u0130stanbul.S01E02.mkv', 'shows')).toMatchObject({
      key: 'episode:i\u0307stanbul:1:2',
    });
  });

  it.each(['Show.Name.2024.mkv', '04 - Episode.mkv', 'Show.S01E00.mkv', '', '\0'])('does not invent an episode for ambiguous or malformed input %j', (path) => {
    expect(() => parseMediaPath(path, 'shows')).not.toThrow();
    expect(parseMediaPath(path, 'shows')).toBeNull();
  });
});
