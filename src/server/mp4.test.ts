import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { isFragmentedMp4 } from './mp4.ts';

const cleanup: string[] = [];
afterAll(async () => { await Promise.all(cleanup.map((dir) => rm(dir, { recursive: true, force: true }))); });

/** Build a top-level box: 32-bit size, four-character type, payload. */
function box(type: string, payload: Buffer = Buffer.alloc(0)): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(payload.length + 8, 0);
  header.write(type, 4, 'latin1');
  return Buffer.concat([header, payload]);
}

async function file(name: string, contents: Buffer): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'dose-mp4-')); cleanup.push(dir);
  const path = join(dir, name);
  await writeFile(path, contents);
  return path;
}

const ftyp = box('ftyp', Buffer.from('isomiso2avc1mp41', 'latin1'));

describe('isFragmentedMp4', () => {
  it('reports a moov that declares mvex', async () => {
    const moov = box('moov', Buffer.concat([box('mvhd', Buffer.alloc(96)), box('mvex', Buffer.alloc(16))]));
    expect(await isFragmentedMp4(await file('fragmented.mp4', Buffer.concat([ftyp, moov, box('moof', Buffer.alloc(64))])))).toBe(true);
  });

  it('reports a top-level moof even without a readable moov', async () => {
    expect(await isFragmentedMp4(await file('moof-first.mp4', Buffer.concat([ftyp, box('moof', Buffer.alloc(64))])))).toBe(true);
  });

  it('leaves a plain progressive mp4 alone', async () => {
    const moov = box('moov', Buffer.concat([box('mvhd', Buffer.alloc(96)), box('trak', Buffer.alloc(256))]));
    expect(await isFragmentedMp4(await file('plain.mp4', Buffer.concat([ftyp, moov, box('mdat', Buffer.alloc(1024))])))).toBe(false);
  });

  it('treats an unreadable or non-mp4 file as not fragmented', async () => {
    expect(await isFragmentedMp4(await file('junk.mkv', Buffer.from('not an mp4 at all')))).toBe(false);
    expect(await isFragmentedMp4(join(tmpdir(), 'dose-missing-file.mp4'))).toBe(false);
  });
});
