import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PluginsPage } from './PluginsPage';

const plugin = {
  id: 'trailer-fetcher', name: 'Trailer Fetcher', description: 'Fetch trailers', version: '1.0.0',
  fields: [], defaults: {}, secretsSet: [], actions: [], events: [], runnable: true,
  enabled: false, schedule: null, settings: {},
  nextRunAt: null, lastRunAt: null, lastRunStatus: null, lastRunDurationMs: null, lastRunSummary: null, lastRunError: null,
};

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

it('lists plugins as links to their detail page rather than inline settings forms', async () => {
  globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ plugins: [plugin] }), { status: 200 }));
  const { container } = render(<MemoryRouter><PluginsPage /></MemoryRouter>);

  expect(await screen.findByRole('heading', { name: 'Plugins' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Trailer Fetcher' })).toHaveAttribute('href', '/admin/plugins/trailer-fetcher');
  expect(screen.queryByLabelText('Schedule (cron)')).not.toBeInTheDocument();
  expect(container.querySelector('main')).toHaveClass('min-h-0');
});

it('toggles a plugin from the list with a single-field patch', async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ plugins: [plugin] }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ plugin: { ...plugin, enabled: true } }), { status: 200 }));
  globalThis.fetch = fetchMock;
  render(<MemoryRouter><PluginsPage /></MemoryRouter>);

  fireEvent.click(await screen.findByLabelText('Enabled'));

  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
  expect(url).toBe('/api/v1/plugins/trailer-fetcher');
  expect(init.method).toBe('PATCH');
  expect(JSON.parse(String(init.body))).toEqual({ enabled: true });
});
