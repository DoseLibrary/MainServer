import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { History } from './History';

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

const entry = {
  id: 'h1', watchedAt: new Date().toISOString(), startedAt: new Date().toISOString(),
  deviceName: 'Chrome on TV', positionSeconds: 100, durationSeconds: 100,
  item: { id: 'm1', title: 'Arrival', kind: 'movie' as const, posterUrl: '/api/v1/images/p.jpg' },
};

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

function stub(history: unknown[]) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'DELETE') return new Response(null, { status: 204 });
    if (String(input).endsWith('/auth/me')) return json({ user: { id: 'u1', username: 'filip', role: 'member' } });
    return json({ history });
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

it('lists what was watched with device and completion', async () => {
  stub([entry, { ...entry, id: 'h2', positionSeconds: 30, item: { ...entry.item, id: 'e1', title: 'The Target', kind: 'episode', seasonNumber: 1, episodeNumber: 2 } }]);
  render(<MemoryRouter><History /></MemoryRouter>);

  expect(await screen.findByRole('link', { name: 'Arrival' })).toHaveAttribute('href', '/media/m1');
  expect(screen.getByText(/Chrome on TV · Finished/)).toBeInTheDocument();
  expect(screen.getByText('S1E2')).toBeInTheDocument();
  expect(screen.getByText(/30% in/)).toBeInTheDocument();
});

it('removes a single title from the history', async () => {
  const fetchMock = stub([entry]);
  render(<MemoryRouter><History /></MemoryRouter>);

  fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));

  await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) =>
    String(url) === '/api/v1/me/history?itemId=m1' && (init as RequestInit | undefined)?.method === 'DELETE')).toBe(true));
});

it('asks before clearing everything', async () => {
  const fetchMock = stub([entry]);
  render(<MemoryRouter><History /></MemoryRouter>);

  fireEvent.click(await screen.findByRole('button', { name: 'Clear history' }));
  // Nothing is deleted until the second, explicit confirmation.
  expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === 'DELETE')).toBe(false);

  fireEvent.click(screen.getByRole('button', { name: 'Clear everything' }));
  await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) =>
    String(url) === '/api/v1/me/history' && (init as RequestInit | undefined)?.method === 'DELETE')).toBe(true));
});

it('invites a first watch when there is nothing yet', async () => {
  stub([]);
  render(<MemoryRouter><History /></MemoryRouter>);

  expect(await screen.findByText('Nothing watched yet.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Clear history' })).not.toBeInTheDocument();
});
