import { open } from 'node:fs/promises';

/**
 * Fragmented-MP4 detection.
 *
 * A fragmented file carries its samples in `moof`/`mdat` pairs instead of one
 * indexed `mdat`, and its `moov` declares that with an `mvex` box. Browsers
 * play such a file only through MSE; handed one progressively they download
 * forever looking for an index and never reach `loadedmetadata`. ffprobe
 * reports the same codecs and container as any other MP4, so the layout has to
 * be read from the file itself.
 */

/** Enough for `ftyp` plus a faststart `moov`; a fragmented head declares itself well inside this. */
const HEAD_BYTES = 256 * 1024;

const boxType = (head: Buffer, offset: number) => head.toString('latin1', offset + 4, offset + 8);

/**
 * True when the file's head shows fragmentation: a top-level `moof`, or an
 * `mvex` inside `moov`. A head that ends before either (a `moov` past the
 * window, or a non-MP4) reads as not fragmented — the caller keeps whatever it
 * would have done anyway.
 */
export async function isFragmentedMp4(path: string): Promise<boolean> {
  let handle;
  try { handle = await open(path, 'r'); }
  catch { return false; }
  try {
    const buffer = Buffer.alloc(HEAD_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, HEAD_BYTES, 0);
    const head = buffer.subarray(0, bytesRead);
    let offset = 0;
    while (offset + 8 <= head.length) {
      const type = boxType(head, offset);
      let size = head.readUInt32BE(offset);
      let header = 8;
      // A 64-bit size follows the type; `0` means the box runs to end of file.
      if (size === 1) {
        if (offset + 16 > head.length) return false;
        const large = head.readBigUInt64BE(offset + 8);
        if (large > BigInt(Number.MAX_SAFE_INTEGER)) return false;
        size = Number(large); header = 16;
      } else if (size === 0) {
        size = head.length - offset;
      }
      if (size < header) return false;
      if (type === 'moof') return true;
      // `mvex` sits among moov's children; searching the box's bytes finds it
      // without walking the whole nested header tree.
      if (type === 'moov') return head.subarray(offset + header, Math.min(offset + size, head.length)).includes('mvex', 0, 'latin1');
      offset += size;
    }
    return false;
  } catch {
    // An unreadable head never blocks playback; the caller falls back to codecs.
    return false;
  } finally {
    await handle.close().catch(() => undefined);
  }
}
