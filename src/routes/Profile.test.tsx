import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Profile } from './Profile';

describe('Profile', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('shows account details and administrator controls to admins', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) return json({ user: { id: 'u1', username: 'filip', role: 'admin' } });
      if (url.endsWith('/libraries')) return json({ libraries: [{ id: 'l1', name: 'Movies', kind: 'movies' }] });
      if (url.endsWith('/health')) return json({ status: 'ok', database: 'ok' });
      if (url.endsWith('/me/settings')) return json({ settings: { showCollectionGaps: false } });
      return json({}, 404);
    });
    render(<MemoryRouter><Profile /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'filip' })).toBeInTheDocument();
    expect(screen.getByText('Administrator')).toBeInTheDocument();
    // Server management moved to its own /admin pages; the profile links there.
    expect(screen.getByRole('button', { name: 'Open administration' })).toBeInTheDocument();
  });

  it('hides administration controls from members', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => String(input).endsWith('/auth/me') ? json({ user: { id: 'u2', username: 'guest', role: 'member' } }) : String(input).endsWith('/libraries') ? json({ libraries: [] }) : String(input).endsWith('/me/settings') ? json({ settings: { showCollectionGaps: false } }) : json({ status: 'ok', database: 'ok' }));
    render(<MemoryRouter><Profile /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'guest' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Administration' })).not.toBeInTheDocument();
  });

  it('imports a watch-data document and reports the summary', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) return json({ user: { id: 'u2', username: 'guest', role: 'member' } });
      if (url.endsWith('/libraries')) return json({ libraries: [] });
      if (url.endsWith('/health')) return json({ status: 'ok', database: 'ok' });
      if (url.endsWith('/me/settings')) return json({ settings: { showCollectionGaps: false } });
      if (url.endsWith('/watch-data/import') && init?.method === 'POST') return json({ summary: { matched: 3, written: 2, unmatched: [{ title: 'Ghost', kind: 'movie' }] } });
      return json({}, 404);
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    render(<MemoryRouter><Profile /></MemoryRouter>);

    const document = { version: 1, progress: [], watchlist: [], collections: [] };
    const file = new File([JSON.stringify(document)], 'dose-watch-data.json', { type: 'application/json' });
    const input = await screen.findByLabelText('Import watch data');
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText('Imported 2 of 3 matched entries; 1 not found in this library.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/me/watch-data/import', expect.objectContaining({ method: 'POST' }));
  });

  it('imports history from the selected external source', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) return json({ user: { id: 'u2', username: 'guest', role: 'member' } });
      if (url.endsWith('/libraries')) return json({ libraries: [] });
      if (url.endsWith('/health')) return json({ status: 'ok', database: 'ok' });
      if (url.endsWith('/me/settings')) return json({ settings: { showCollectionGaps: false } });
      if (url.endsWith('/import/tautulli') && init?.method === 'POST') return json({ summary: { matched: 4, written: 4, skipped: 1, unmatched: [], errors: [] } });
      return json({}, 404);
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    render(<MemoryRouter><Profile /></MemoryRouter>);

    fireEvent.click(await screen.findByRole('button', { name: 'Tautulli' }));
    fireEvent.change(screen.getByLabelText('Tautulli URL'), { target: { value: 'http://tautulli.local:8181' } });
    fireEvent.change(screen.getByLabelText('Tautulli API key'), { target: { value: 'key' } });
    fireEvent.click(screen.getByRole('button', { name: 'Import history' }));

    expect(await screen.findByText('Imported 4 of 4 matched entries; 1 not found in this library.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/me/watch-data/import/tautulli', expect.objectContaining({ method: 'POST', body: JSON.stringify({ baseUrl: 'http://tautulli.local:8181', apiKey: 'key' }) }));
  });

  it('loads and persists the collection gap preference', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) return json({ user: { id: 'u2', username: 'guest', role: 'member' } });
      if (url.endsWith('/libraries')) return json({ libraries: [] });
      if (url.endsWith('/health')) return json({ status: 'ok', database: 'ok' });
      if (url.endsWith('/me/settings') && init?.method === 'PUT') return json({ settings: { showCollectionGaps: true } });
      if (url.endsWith('/me/settings')) return json({ settings: { showCollectionGaps: false } });
      return json({}, 404);
    });
    render(<MemoryRouter><Profile /></MemoryRouter>);
    const toggle = await screen.findByRole('checkbox', { name: 'Show missing movies from collections' });
    expect(toggle).not.toBeChecked(); fireEvent.click(toggle); expect(toggle).toBeChecked();
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith('/api/v1/me/settings', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ showCollectionGaps: true }) })));
  });
});

function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }); }
