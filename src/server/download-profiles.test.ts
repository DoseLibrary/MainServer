import { describe, expect, it } from 'vitest';
import { buildDownloadArgs, DOWNLOAD_PROFILES, estimateBytes, estimateTotalBytes, isDownloadProfile } from './download-profiles.ts';

const gb = (bytes: number) => bytes / 1_000_000_000;

describe('size estimates', () => {
  it('puts a film and an episode in the range a phone can hold', () => {
    const film = 2 * 3600;
    const episode = 45 * 60;

    expect(gb(estimateBytes(film, DOWNLOAD_PROFILES.sd))).toBeCloseTo(0.94, 1);
    expect(gb(estimateBytes(film, DOWNLOAD_PROFILES.hd))).toBeCloseTo(1.68, 1);
    expect(estimateBytes(episode, DOWNLOAD_PROFILES.sd)).toBeGreaterThan(300_000_000);
    expect(estimateBytes(episode, DOWNLOAD_PROFILES.sd)).toBeLessThan(360_000_000);
  });

  it('scales with runtime and with the profile', () => {
    expect(estimateBytes(3600, DOWNLOAD_PROFILES.sd)).toBeCloseTo(estimateBytes(1800, DOWNLOAD_PROFILES.sd) * 2, -5);
    expect(estimateBytes(3600, DOWNLOAD_PROFILES.hd)).toBeGreaterThan(estimateBytes(3600, DOWNLOAD_PROFILES.sd));
  });

  it('totals a season so the figure can be shown before committing', () => {
    const season = Array.from({ length: 10 }, () => 45 * 60);

    const total = estimateTotalBytes(season, DOWNLOAD_PROFILES.sd);

    expect(total).toBe(estimateBytes(45 * 60, DOWNLOAD_PROFILES.sd) * 10);
    expect(gb(total)).toBeCloseTo(3.5, 1);
  });

  it('claims nothing for a runtime it does not know', () => {
    expect(estimateBytes(0, DOWNLOAD_PROFILES.sd)).toBe(0);
    expect(estimateBytes(Number.NaN, DOWNLOAD_PROFILES.sd)).toBe(0);
    expect(estimateTotalBytes([], DOWNLOAD_PROFILES.sd)).toBe(0);
  });
});

describe('encode arguments', () => {
  it('produces a phone-safe file that can start before it is fully read', () => {
    const args = buildDownloadArgs('/media/Film.mkv', '/tmp/out.mp4', DOWNLOAD_PROFILES.sd);
    const text = args.join(' ');

    expect(text).toContain('-c:v libx264');
    expect(text).toContain('-profile:v high');
    expect(text).toContain('-pix_fmt yuv420p');
    expect(text).toContain('scale=-2:480');
    expect(text).toContain('-c:a aac');
    expect(text).toContain('-ac 2');
    // Without faststart a phone must read the whole file before it can play.
    expect(text).toContain('-movflags +faststart');
  });

  it('carries the chosen audio track, and tolerates a file without one', () => {
    expect(buildDownloadArgs('/m/f.mkv', '/tmp/o.mp4', DOWNLOAD_PROFILES.hd, 2).join(' ')).toContain('-map 0:a:2?');
  });

  it('recognises only the profiles it offers', () => {
    expect(isDownloadProfile('sd')).toBe(true);
    expect(isDownloadProfile('hd')).toBe(true);
    expect(isDownloadProfile('4k')).toBe(false);
  });
});
