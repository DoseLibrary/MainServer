import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { UserCollections } from './UserCollections';

const COLLECTION = '60000000-0000-4000-8000-000000000001';
const ONE = '20000000-0000-4000-8000-000000000001';
const TWO = '20000000-0000-4000-8000-000000000002';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('UserCollections', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('creates a collection and lists it with its title count', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/v1/me/collections' && init?.method === 'POST') return json({ collection: { id: COLLECTION, name: 'Marathon', itemCount: 0 } }, 201);
      return json({ collections: init?.method ? [] : [{ id: COLLECTION, name: 'Marathon', itemCount: 2 }] });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    render(<MemoryRouter><UserCollections /></MemoryRouter>);

    expect(await screen.findByText('Marathon')).toBeInTheDocument();
    expect(screen.getByText('2 titles')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('New collection'), { target: { value: 'Rewatch' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/v1/me/collections', expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'Rewatch' }) })));
  });

  it('opens a collection and reorders its items', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === `/api/v1/me/collections/${COLLECTION}/items` && init?.method === 'PUT') {
        return json({ collection: { id: COLLECTION, name: 'Marathon', items: [{ id: TWO, title: 'Two', year: 2021, kind: 'movie' }, { id: ONE, title: 'One', year: 2020, kind: 'movie' }] } });
      }
      if (url === `/api/v1/me/collections/${COLLECTION}`) {
        return json({ collection: { id: COLLECTION, name: 'Marathon', items: [{ id: ONE, title: 'One', year: 2020, kind: 'movie' }, { id: TWO, title: 'Two', year: 2021, kind: 'movie' }] } });
      }
      return json({ collections: [{ id: COLLECTION, name: 'Marathon', itemCount: 2 }] });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    render(<MemoryRouter><UserCollections /></MemoryRouter>);

    fireEvent.click(await screen.findByRole('button', { name: 'Open' }));
    expect(await screen.findByRole('link', { name: 'One (2020)' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Move One down' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`/api/v1/me/collections/${COLLECTION}/items`, expect.objectContaining({ method: 'PUT', body: JSON.stringify({ mediaItemIds: [TWO, ONE] }) })));
    const links = await screen.findAllByRole('link', { name: /\(20\d\d\)/ });
    expect(links[0]).toHaveTextContent('Two (2021)');
  });
});
