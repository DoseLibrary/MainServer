import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PluginDetailPage } from './PluginDetailPage';

const plugin = {
  id: 'trailer-fetcher', name: 'Trailer Fetcher', description: 'Fetch trailers', version: '1.0.0',
  fields: [
    { kind: 'select', key: 'qualityCap', label: 'Maximum quality', options: [{ value: '720', label: '720p' }, { value: '1080', label: '1080p' }], group: 'Selection' },
    { kind: 'number', key: 'updateIntervalDays', label: 'Update interval (days)', min: 1, max: 90, group: 'Downloader' },
    { kind: 'list', key: 'languages', label: 'Preferred languages', group: 'Selection' },
    { kind: 'password', key: 'apiKey', label: 'API key', group: 'Downloader' },
  ],
  defaults: {}, secretsSet: ['apiKey'], actions: [{ id: 'purge', label: 'Purge downloads' }], events: ['media.item.enriched'], runnable: true,
  enabled: true, schedule: '0 3 * * *', settings: { qualityCap: '1080', updateIntervalDays: 7, languages: ['en'], apiKey: null },
  nextRunAt: null, lastRunAt: null, lastRunStatus: 'succeeded', lastRunDurationMs: 1200, lastRunSummary: 'Fetched 2 trailers', lastRunError: null,
};

const runs = [{ id: 'r1', pluginId: 'trailer-fetcher', status: 'succeeded', startedAt: '2026-01-01T10:00:00.000Z', finishedAt: '2026-01-01T10:00:02.000Z', durationMs: 2000, summary: 'Fetched 2 trailers', error: null }];

function respond(input: RequestInfo | URL, init?: RequestInit) {
  const url = String(input);
  if (url === '/api/v1/plugins/trailer-fetcher' && (!init || init.method === undefined)) return new Response(JSON.stringify({ plugin }), { status: 200 });
  if (url.endsWith('/runs')) return new Response(JSON.stringify({ runs }), { status: 200 });
  return new Response(JSON.stringify({ plugin }), { status: 200 });
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin/plugins/trailer-fetcher']}>
      <Routes><Route path="/admin/plugins/:id" element={<PluginDetailPage />} /></Routes>
    </MemoryRouter>,
  );
}

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

it('renders declared widgets, grouped, with the events the plugin reacts to', async () => {
  globalThis.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => Promise.resolve(respond(url, init)));
  renderPage();

  const quality = await screen.findByLabelText('Maximum quality');
  expect(quality.tagName).toBe('SELECT');
  expect(screen.getByRole('option', { name: '720p' })).toBeInTheDocument();
  const interval = screen.getByLabelText('Update interval (days)');
  expect(interval).toHaveAttribute('type', 'number');
  expect(interval).toHaveAttribute('max', '90');
  expect(screen.getByLabelText('API key')).toHaveAttribute('placeholder', 'Stored — leave blank to keep');
  expect(screen.getByText(/Reacts to:/)).toHaveTextContent('media.item.enriched');
  expect(screen.getByText('Selection')).toBeInTheDocument();
  expect(screen.getByRole('table')).toHaveTextContent('Fetched 2 trailers');
});

it('saves the draft without resending an untouched secret', async () => {
  const fetchMock = vi.fn((url: RequestInfo | URL, init?: RequestInit) => Promise.resolve(respond(url, init)));
  globalThis.fetch = fetchMock;
  renderPage();

  fireEvent.change(await screen.findByLabelText('Maximum quality'), { target: { value: '720' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH')).toBe(true));
  const patch = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH')!;
  expect(JSON.parse(String((patch[1] as RequestInit).body))).toEqual({
    enabled: true, schedule: '0 3 * * *', settings: { qualityCap: '720', updateIntervalDays: 7, languages: ['en'], apiKey: null },
  });
});

it('shows a rejected field inline instead of a bare error', async () => {
  globalThis.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => Promise.resolve(
    (init as RequestInit | undefined)?.method === 'PATCH'
      ? new Response(JSON.stringify({ error: 'Invalid plugin settings', errors: { updateIntervalDays: 'Too large' } }), { status: 400 })
      : respond(url, init),
  ));
  renderPage();

  fireEvent.change(await screen.findByLabelText('Update interval (days)'), { target: { value: '400' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  expect(await screen.findByText('Too large')).toBeInTheDocument();
});

it('runs a declared action through its own endpoint', async () => {
  const fetchMock = vi.fn((url: RequestInfo | URL, init?: RequestInit) => Promise.resolve(
    String(url).includes('/actions/') ? new Response(JSON.stringify({ run: { id: 'r2', status: 'succeeded', durationMs: 10, summary: 'Purged 3 files' } }), { status: 200 }) : respond(url, init),
  ));
  globalThis.fetch = fetchMock;
  renderPage();

  fireEvent.click(await screen.findByRole('button', { name: 'Purge downloads' }));

  await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url) === '/api/v1/plugins/trailer-fetcher/actions/purge')).toBe(true));
  expect(await screen.findByText('Purged 3 files')).toBeInTheDocument();
});
