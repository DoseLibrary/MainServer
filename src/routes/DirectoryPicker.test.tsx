import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DirectoryPicker } from './DirectoryPicker';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function serverTree() {
  const listings: Record<string, unknown> = {
    '': { path: '/media', parent: null, entries: [{ name: 'movies', path: '/media/movies' }] },
    '/media': { path: '/media', parent: null, entries: [{ name: 'movies', path: '/media/movies' }] },
    '/media/movies': { path: '/media/movies', parent: '/media', entries: [] },
  };
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://dose.test');
    const listing = listings[url.searchParams.get('path') ?? ''];
    return listing ? json(listing) : json({ error: 'Path must be below /media' }, 400);
  });
}

describe('DirectoryPicker', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('walks into a folder, back up, and hands the chosen path to the caller', async () => {
    globalThis.fetch = serverTree();
    const onPick = vi.fn();
    render(<DirectoryPicker open onOpenChange={() => undefined} onPick={onPick} />);

    fireEvent.click(await screen.findByRole('button', { name: 'movies' }));
    await waitFor(() => expect(screen.getByText('/media/movies')).toBeInTheDocument());
    expect(screen.getByText('No subfolders')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Up' }));
    await screen.findByRole('button', { name: 'movies' });

    fireEvent.click(screen.getByRole('button', { name: 'movies' }));
    await waitFor(() => expect(screen.getByText('/media/movies')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Use this folder' }));
    expect(onPick).toHaveBeenCalledWith('/media/movies');
  });

  it('shows the server reason when a listing fails', async () => {
    globalThis.fetch = vi.fn(async () => json({ error: 'Path must be an accessible directory' }, 400));
    render(<DirectoryPicker open onOpenChange={() => undefined} onPick={() => undefined} initialPath="/media/gone" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Path must be an accessible directory');
  });
});
