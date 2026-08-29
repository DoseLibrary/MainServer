import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const markers = [
  '/dev',
  'DevGallery',
  'Component gallery',
  'DOSE UI',
  'Component docs',
  'Choose a component to view its examples.',
  'The Last Horizon',
  'Library updated',
];

async function filesWithin(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesWithin(path) : [path];
  }));
  return files.flat();
}

const files = await filesWithin('dist');
for (const file of files) {
  const content = await readFile(file, 'utf8');
  const marker = markers.find((candidate) => content.includes(candidate));
  if (marker) throw new Error(`Production bundle contains dev marker ${JSON.stringify(marker)} in ${file}`);
}

console.log('Production bundle excludes the /dev gallery.');
