import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArtworkManager } from './ArtworkManager';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('ArtworkManager logos', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('offers provider logos and applies the chosen one', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      if (init?.method === 'PATCH') return json({ item: { id: 'm1' } });
      return json({ posters: [], backdrops: [], logos: [{ path: '/l1.png', previewUrl: 'https://image.tmdb.org/t/p/w500/l1.png' }] });
    });
    globalThis.fetch = fetchMock;
    render(<ArtworkManager open itemId="m1" onOpenChange={() => undefined} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Logo option' }));
    await waitFor(() => expect(screen.getByText('Logo updated')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/catalog/items/m1/artwork', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ logoPath: '/l1.png' }) }));
  });

  it('can clear the logo so the hero falls back to the title text', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      if (init?.method === 'PATCH') return json({ item: { id: 'm1' } });
      return json({ posters: [], backdrops: [], logos: [{ path: '/l1.png', previewUrl: 'https://image.tmdb.org/t/p/w500/l1.png' }] });
    });
    globalThis.fetch = fetchMock;
    render(<ArtworkManager open itemId="m1" onOpenChange={() => undefined} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Remove logo' }));
    await waitFor(() => expect(screen.getByText('Logo removed')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/catalog/items/m1/artwork', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ logoPath: null }) }));
  });
});
