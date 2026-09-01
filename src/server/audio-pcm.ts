import { spawn } from 'node:child_process';

/** Mono, low-rate PCM is plenty for envelope work and keeps decoding cheap. */
export const PCM_SAMPLE_RATE = 5512;

/** Decoding is the only external dependency of the audio analyses, so it is
 * injected: tests hand in synthetic PCM instead of running ffmpeg. */
export interface AudioDecoder {
  /**
   * Mono 16-bit PCM at `PCM_SAMPLE_RATE`.
   * @param maxSeconds how much to decode from `fromSeconds`.
   */
  decode(path: string, maxSeconds: number, signal: AbortSignal, fromSeconds?: number): Promise<Int16Array>;
}

export function ffmpegAudioDecoder(): AudioDecoder {
  return {
    decode(path, maxSeconds, signal, fromSeconds = 0) {
      return new Promise((resolve, reject) => {
        // -ss before -i seeks by keyframe, which is fast and accurate enough here.
        const args = ['-v', 'error', ...(fromSeconds > 0 ? ['-ss', String(fromSeconds)] : []), '-i', path,
          '-t', String(maxSeconds), '-map', '0:a:0', '-ac', '1', '-ar', String(PCM_SAMPLE_RATE), '-f', 's16le', '-'];
        const child = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
        const chunks: Buffer[] = [];
        const stderr: Buffer[] = [];
        const abort = () => child.kill();
        signal.addEventListener('abort', abort, { once: true });
        child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
        child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
        child.once('error', reject);
        child.once('close', (code) => {
          signal.removeEventListener('abort', abort);
          if (signal.aborted) return reject(signal.reason ?? new Error('Audio decoding cancelled'));
          if (code !== 0) return reject(new Error(`ffmpeg exited with code ${code}: ${Buffer.concat(stderr).toString().slice(0, 300)}`));
          const buffer = Buffer.concat(chunks);
          resolve(new Int16Array(buffer.buffer, buffer.byteOffset, Math.floor(buffer.byteLength / 2)));
        });
      });
    },
  };
}
