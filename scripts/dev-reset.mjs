import { rm } from 'node:fs/promises';
import { resolve, basename } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const target = resolve(root, '.dose');
if (basename(target) !== '.dose' || resolve(target, '..') !== root) throw new Error('Refusing to reset an unexpected path');
await rm(target, { recursive: true, force: true });
console.log('Local Dose development data reset. Run `bun run dev` to recreate it.');
