import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Queue } from './Queue';

const ONE = '20000000-0000-4000-8000-000000000001';
const TWO = '20000000-0000-4000-8000-000000000002';
const GONE = '20000000-0000-4000-8000-000000000003';

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

function renderQueue() {
  render(
    <MemoryRouter initialEntries={['/profile/queue']}>
      <Routes>
        <Route path="/profile/queue" element={<Queue />} />
        <Route path="/watch/:id" element={<p>watching</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Queue', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('flags unavailable entries and reorders the queue', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PUT') return json({ items: [{ id: TWO, title: 'Two', kind: 'movie' }, { id: ONE, title: 'One', kind: 'movie' }] });
      void input;
      return json({ items: [
        { id: ONE, title: 'One', kind: 'movie', unavailable: false },
        { id: TWO, title: 'Two', kind: 'movie', unavailable: false },
        { id: GONE, title: 'Gone', kind: 'movie', unavailable: true },
      ] });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    renderQueue();

    expect(await screen.findByRole('link', { name: 'One' })).toBeInTheDocument();
    expect(screen.getByText('Unavailable')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Move One down' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/v1/me/queue', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ mediaItemIds: [TWO, ONE, GONE] }) })));
  });

  it('starts the marathon on the first playable title', async () => {
    globalThis.fetch = vi.fn(async () => json({ items: [
      { id: GONE, title: 'Gone', kind: 'movie', unavailable: true },
      { id: ONE, title: 'One', kind: 'movie', unavailable: false },
    ] })) as unknown as typeof fetch;
    renderQueue();

    fireEvent.click(await screen.findByRole('button', { name: 'Start marathon' }));
    expect(await screen.findByText('watching')).toBeInTheDocument();
  });

  it('shows an empty state with the marathon action disabled', async () => {
    globalThis.fetch = vi.fn(async () => json({ items: [] })) as unknown as typeof fetch;
    renderQueue();

    expect(await screen.findByText(/Your queue is empty/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start marathon' })).toBeDisabled();
  });
});
