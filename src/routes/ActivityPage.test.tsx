import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ActivityPage } from './ActivityPage';

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

const session = {
  id: 'p1', username: 'filip', deviceName: 'Chrome on TV', playMethod: 'transcode' as const,
  positionSeconds: 1230, durationSeconds: 7500, paused: false,
  startedAt: new Date().toISOString(), lastReportedAt: new Date().toISOString(),
  item: { id: 'm1', title: 'Arrival', kind: 'movie' as const, posterUrl: '/api/v1/images/p.jpg' },
};

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; vi.useRealTimers(); });

function stub(payload: unknown) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/auth/me')) return json({ user: { id: 'u1', username: 'filip', role: 'admin' } });
    return json(payload);
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

it('shows who is watching what, how it is being played, and how far in', async () => {
  stub({ sessions: [session] });
  render(<MemoryRouter><ActivityPage /></MemoryRouter>);

  expect(await screen.findByText('Arrival')).toBeInTheDocument();
  expect(screen.getByText(/filip · Chrome on TV · Transcode/)).toBeInTheDocument();
  expect(screen.getByText('20:30 of 2:05:00 · 16%')).toBeInTheDocument();
});

it('marks a paused session and labels episodes', async () => {
  stub({ sessions: [{ ...session, paused: true, item: { ...session.item, kind: 'episode', title: 'The Target', seasonNumber: 1, episodeNumber: 2 } }] });
  render(<MemoryRouter><ActivityPage /></MemoryRouter>);

  expect(await screen.findByText('Paused')).toBeInTheDocument();
  expect(screen.getByText('S1E2')).toBeInTheDocument();
});

it('says so plainly when the server is idle', async () => {
  stub({ sessions: [] });
  render(<MemoryRouter><ActivityPage /></MemoryRouter>);

  expect(await screen.findByText('Nothing is playing.')).toBeInTheDocument();
});

it('keeps polling while the page is open, and stops when it closes', async () => {
  const fetchMock = stub({ sessions: [] });
  const activityCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).includes('/admin/activity')).length;
  const { unmount } = render(<MemoryRouter><ActivityPage /></MemoryRouter>);

  await screen.findByText('Nothing is playing.');
  const first = activityCalls();
  await waitFor(() => expect(activityCalls()).toBeGreaterThan(first), { timeout: 8000 });

  unmount();
  const afterUnmount = activityCalls();
  await new Promise((resolve) => setTimeout(resolve, 6000));
  expect(activityCalls()).toBe(afterUnmount);
}, 20_000);
