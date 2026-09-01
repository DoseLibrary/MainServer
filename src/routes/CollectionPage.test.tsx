import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CollectionPage } from './CollectionPage';

const COLLECTION = '60000000-0000-4000-8000-000000000001';

function renderPage() {
  render(
    <MemoryRouter initialEntries={[`/collection/${COLLECTION}`]}>
      <Routes><Route path="/collection/:id" element={<CollectionPage />} /></Routes>
    </MemoryRouter>,
  );
}

describe('CollectionPage', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('renders missing members as greyed, non-navigable placeholders', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ collection: {
      id: COLLECTION, name: 'Saga', titles: [{ id: 'm1', title: 'One', year: 2020, kind: 'movie' }],
      missing: [{ tmdbId: '101', title: 'Two', year: 2022, inLibrary: false }],
    } }), { status: 200 }));
    renderPage();

    expect(await screen.findByRole('link', { name: /One/ })).toHaveAttribute('href', '/media/m1');
    const gap = screen.getByTestId('collection-gap');
    expect(within(gap).getByText('Two')).toBeInTheDocument();
    expect(within(gap).getByText('Not in library')).toBeInTheDocument();
    expect(within(gap).queryByRole('link')).toBeNull();
    expect(within(gap).queryByRole('button')).toBeNull();
  });

  /** Routes the page's two calls: the collection itself and Seerr request state. */
  function mockRoutes(requests: { configured: boolean; requests: Array<{ tmdbId: number; state: string }> }, onRequest?: () => Response) {
    const collection = { id: COLLECTION, name: 'Saga', titles: [], missing: [
      { tmdbId: '101', title: 'Two', year: 2022, inLibrary: false },
      { tmdbId: '102', title: 'Three', year: 2024, inLibrary: false },
    ] };
    return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/v1/requests' && init?.method === 'POST') return onRequest?.() ?? new Response(JSON.stringify({ request: { tmdbId: 101, state: 'pending' } }), { status: 201 });
      if (url === '/api/v1/requests') return new Response(JSON.stringify(requests), { status: 200 });
      return new Response(JSON.stringify({ collection }), { status: 200 });
    }) as unknown as typeof fetch;
  }

  const gapNamed = async (name: string) => {
    const gaps = await screen.findAllByTestId('collection-gap');
    return gaps.find((gap) => within(gap).queryByText(name))!;
  };

  it('offers a request on each gap once Seerr is configured', async () => {
    globalThis.fetch = mockRoutes({ configured: true, requests: [] });
    renderPage();

    const gap = await gapNamed('Two');
    await waitFor(() => expect(within(gap).getByRole('button', { name: /Request/ })).toBeInTheDocument());
  });

  it('shows what Seerr already knows instead of offering it again', async () => {
    globalThis.fetch = mockRoutes({ configured: true, requests: [{ tmdbId: 101, state: 'pending' }, { tmdbId: 102, state: 'processing' }] });
    renderPage();

    const requested = await gapNamed('Two');
    await waitFor(() => expect(within(requested).getByText('Requested')).toBeInTheDocument());
    expect(within(requested).queryByRole('button')).toBeNull();
    expect(within(await gapNamed('Three')).getByText('Downloading')).toBeInTheDocument();
  });

  it('marks a title requested as soon as Seerr accepts it', async () => {
    globalThis.fetch = mockRoutes({ configured: true, requests: [] });
    renderPage();

    const gap = await gapNamed('Two');
    await waitFor(() => expect(within(gap).getByRole('button', { name: /Request/ })).toBeInTheDocument());
    fireEvent.click(within(gap).getByRole('button', { name: /Request/ }));

    await waitFor(() => expect(within(gap).getByText('Requested')).toBeInTheDocument());
    // The other gap is untouched: one click requests one title.
    expect(within(await gapNamed('Three')).getByRole('button', { name: /Request/ })).toBeInTheDocument();
  });

  it('explains a rejected request and leaves the button usable', async () => {
    globalThis.fetch = mockRoutes({ configured: true, requests: [] }, () => new Response(JSON.stringify({ error: 'Seerr rejected the API key' }), { status: 502 }));
    renderPage();

    const gap = await gapNamed('Two');
    await waitFor(() => expect(within(gap).getByRole('button', { name: /Request/ })).toBeInTheDocument());
    fireEvent.click(within(gap).getByRole('button', { name: /Request/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/rejected the API key/);
    expect(within(gap).getByRole('button', { name: /Request/ })).toBeEnabled();
  });

  it('omits placeholders when the response carries no gaps', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ collection: {
      id: COLLECTION, name: 'Saga', titles: [{ id: 'm1', title: 'One', year: 2020, kind: 'movie' }],
    } }), { status: 200 }));
    renderPage();

    expect(await screen.findByRole('link', { name: /One/ })).toBeInTheDocument();
    expect(screen.queryByTestId('collection-gap')).toBeNull();
  });
});
