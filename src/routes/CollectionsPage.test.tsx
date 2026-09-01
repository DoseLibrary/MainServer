import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CollectionsPage } from './CollectionsPage';

function mockFetch(catalog: unknown[], mine: unknown[]) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith('/api/v1/catalog/collections')) return new Response(JSON.stringify({ collections: catalog }), { status: 200 });
    if (url.startsWith('/api/v1/me/collections')) return new Response(JSON.stringify({ collections: mine }), { status: 200 });
    return new Response('{}', { status: 404 });
  }) as unknown as typeof fetch;
}

describe('CollectionsPage', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  const view = () => render(
    <MemoryRouter initialEntries={['/collections']}><Routes><Route path="/collections" element={<CollectionsPage />} /></Routes></MemoryRouter>,
  );

  it('lists library collections and personal collections with their links', async () => {
    mockFetch(
      [{ id: 'c1', name: 'Saga', posterUrl: '/api/v1/images/c.jpg', count: 3 }],
      [{ id: 'u1', name: 'Movie night', itemCount: 2 }],
    );
    view();

    const saga = await screen.findByRole('link', { name: /Saga/ });
    expect(saga).toHaveAttribute('href', '/collection/c1');
    expect(screen.getByText('3 titles')).toBeInTheDocument();
    const mine = screen.getByRole('link', { name: /Movie night/ });
    expect(mine).toHaveAttribute('href', '/my-collection/u1');
    expect(screen.getByRole('link', { name: 'Manage' })).toHaveAttribute('href', '/profile/collections');
  });

  it('hides the personal section entirely when there are none', async () => {
    mockFetch([{ id: 'c1', name: 'Saga', count: 1 }], []);
    view();

    expect(await screen.findByRole('link', { name: /Saga/ })).toBeInTheDocument();
    expect(screen.queryByText('Your collections')).not.toBeInTheDocument();
  });

  it('shows an empty state when there is nothing at all', async () => {
    mockFetch([], []);
    view();
    expect(await screen.findByText(/No collections yet/)).toBeInTheDocument();
  });
});
