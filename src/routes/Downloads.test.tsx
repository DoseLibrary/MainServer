import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Downloads } from './Downloads';
import { DownloadQueue, type DownloadEntry, type DownloadMetaStore } from '@/lib/download-queue';
import { MemoryDownloadStore } from '@/lib/download-store';

const entries = new Map<string, DownloadEntry>();
const meta: DownloadMetaStore = {
  all: async () => [...entries.values()],
  put: async (entry) => { entries.set(entry.id, { ...entry }); },
  remove: async (id) => { entries.delete(id); },
};
let store: MemoryDownloadStore;
let queue: DownloadQueue;
let installed = true;
let supported = true;

vi.mock('@/lib/download-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/download-store')>();
  return {
    ...actual,
    supportsDownloads: () => supported,
    isInstalledApp: () => installed,
    storageBudget: async () => ({ usedBytes: 2_000_000_000, availableBytes: 12_000_000_000, persisted: true }),
  };
});

vi.mock('@/lib/downloads', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/downloads')>();
  return { ...actual, downloadQueue: () => queue };
});

const entry = (over: Partial<DownloadEntry> = {}): DownloadEntry => ({
  id: 'd1', mediaItemId: 'm1', title: 'Arrival', profile: 'sd', status: 'ready',
  estimatedBytes: 800_000_000, bytesTotal: 800_000_000, bytesDone: 800_000_000,
  expiresAt: new Date(Date.now() + 5 * 86_400_000).toISOString(), order: 0, ...over,
});

beforeEach(() => {
  entries.clear();
  installed = true;
  supported = true;
  store = new MemoryDownloadStore();
  // The device really holds the bytes an entry claims, so reconcile() leaves
  // fixtures alone instead of treating them as evicted.
  vi.spyOn(store, 'size').mockImplementation(async (id: string) => entries.get(id)?.bytesDone ?? 0);
  queue = new DownloadQueue(store, meta, {
    status: async () => ({ status: 'ready', sizeBytes: 800_000_000 }),
    fetchFrom: async () => ({ chunk: new Uint8Array(0), total: 800_000_000 }),
    complete: async () => {},
    cancel: async () => {},
  }, async () => {});
});

it('shows what the device holds, with size, quality and expiry', async () => {
  await meta.put(entry());
  render(<MemoryRouter><Downloads /></MemoryRouter>);

  expect(await screen.findByText('Arrival')).toBeInTheDocument();
  expect(screen.getByText(/800 MB · 480p · 5 days left/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Play' })).toHaveAttribute('href', expect.stringContaining('offline=%2Foffline%2Fd1'));
  // The budget lands after its own async check.
  expect(await screen.findByText(/2 GB used · about 12 GB free/)).toBeInTheDocument();
});

it('reports progress while a title is still coming down', async () => {
  await meta.put(entry({ status: 'downloading', bytesDone: 200_000_000 }));
  render(<MemoryRouter><Downloads /></MemoryRouter>);

  expect(await screen.findByText('Downloading')).toBeInTheDocument();
  expect(screen.getByText(/200 MB of 800 MB/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
});

it('offers a resume rather than a pause once something has stopped', async () => {
  await meta.put(entry({ status: 'paused', bytesDone: 10, error: 'There is not enough space left on this device' }));
  render(<MemoryRouter><Downloads /></MemoryRouter>);

  expect(await screen.findByRole('button', { name: 'Resume' })).toBeInTheDocument();
  expect(screen.getByText(/not enough space/)).toBeInTheDocument();
});

it('says plainly when expired copies were cleared out', async () => {
  await meta.put(entry({ id: 'old', expiresAt: new Date(Date.now() - 1000).toISOString() }));
  render(<MemoryRouter><Downloads /></MemoryRouter>);

  expect(await screen.findByText(/1 download expired/)).toBeInTheDocument();
});

it('insists on an installed app before downloads can be trusted', async () => {
  installed = false;
  await meta.put(entry());
  render(<MemoryRouter><Downloads /></MemoryRouter>);

  expect(await screen.findByText('Install Dose first')).toBeInTheDocument();
  expect(screen.getByText(/Add to Home Screen/)).toBeInTheDocument();
});

it('is honest when the browser cannot store anything at all', async () => {
  supported = false;
  render(<MemoryRouter><Downloads /></MemoryRouter>);

  expect(await screen.findByText(/cannot store downloads/)).toBeInTheDocument();
});

it('removing a download takes it off the device', async () => {
  await meta.put(entry());
  const removed = vi.spyOn(store, 'remove');
  render(<MemoryRouter><Downloads /></MemoryRouter>);

  fireEvent.click((await screen.findAllByRole('button', { name: 'Remove' }))[0]);

  await waitFor(() => expect(entries.size).toBe(0));
  expect(removed).toHaveBeenCalledWith('d1');
});
