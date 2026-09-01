import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Home } from './Home';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('Home application flow', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('shows first administrator setup without asking for email', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(json({ setupRequired: true }));
    render(<Home />);

    expect(await screen.findByRole('heading', { name: 'Create your administrator' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
  });

  it('falls back to login when there is no authenticated session', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ setupRequired: false }))
      .mockResolvedValueOnce(json({ error: 'Authentication required' }, 401))
      .mockResolvedValueOnce(json({ error: 'Authentication required' }, 401));
    globalThis.fetch = fetchMock;
    render(<Home />);

    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
  });

  it('loads libraries after login and allows logout', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ setupRequired: false }))
      .mockResolvedValueOnce(json({ error: 'Authentication required' }, 401))
      .mockResolvedValueOnce(json({ error: 'Authentication required' }, 401))
      .mockResolvedValueOnce(json({ user: { id: 'u1', username: 'filip' } }))
      .mockResolvedValueOnce(json({ user: { id: 'u1', username: 'filip' } }))
      .mockResolvedValueOnce(json({ libraries: [{ id: 'movies', name: 'Movies', kind: 'movies' }] }))
      .mockResolvedValueOnce(json({ sections: [{ id: 'recent', title: 'Movies', items: [] }] }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    globalThis.fetch = fetchMock;
    render(<Home />);

    await screen.findByRole('heading', { name: 'Welcome back' });
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'filip' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'long-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    // Profile now lives in the account dropdown; sign out is a menu item.
    const accountButton = (await screen.findAllByRole('button', { name: /Account menu/ }))[0];
    fireEvent.pointerDown(accountButton); fireEvent.click(accountButton);
    fireEvent.click(await screen.findByText('Sign out'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument());
  });

  it('maps aggregated catalog media across every library', async () => {
    const libraries = [{ id: 'movies', name: 'Movies' }, { id: 'shows', name: 'Shows' }];
    globalThis.fetch = vi.fn(async (input) => {
      const url = String(input);
      if (url === '/api/v1/setup/status') return json({ setupRequired: false });
      if (url === '/api/v1/auth/me') return json({ user: { id: 'u2', username: 'guest', role: 'member' } });
      if (url === '/api/v1/libraries') return json({ libraries });
      // No libraryId aggregates every library so movies and shows share one home.
      if (url.startsWith('/api/v1/catalog/home')) return json({ featured: { id: 'movie-1', title: 'Arrival', kind: 'movie', overview: 'First contact.' }, sections: [{ id: 'newly-added', title: 'Newly Added', layout: 'card', items: [{ id: 'movie-1', title: 'Arrival', year: 2016, kind: 'movie' }] }, { id: 'newly-added-shows', title: 'Newly Added Shows', layout: 'card', items: [{ id: 'show-1', title: 'Severance', year: 2022, kind: 'series' }] }] });
      throw new Error(`Unexpected request ${url}`);
    });
    render(<Home />);
    expect(await screen.findByRole('heading', { name: 'Arrival' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View details' })).toHaveAttribute('href', '/media/movie-1');
    // The library selector was removed; the aggregated home shows both kinds without navigation.
    expect((await screen.findAllByText('Severance')).length).toBeGreaterThan(0);
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/v1/catalog/home', expect.anything());
  });

  it('keeps library management hidden from members', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(json({ setupRequired: false }))
      .mockResolvedValueOnce(json({ user: { id: 'u2', username: 'guest', role: 'member' } }))
      .mockResolvedValueOnce(json({ libraries: [] }));
    render(<Home />);
    await screen.findByText('Your library is ready');
    expect(screen.queryByRole('button', { name: 'Manage libraries' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Manage family' })).not.toBeInTheDocument();
  });

  it('offers a validated local hero trailer through the routed player', async () => {
    globalThis.fetch = vi.fn(async (input) => { const url = String(input); if (url.endsWith('/setup/status')) return json({ setupRequired: false }); if (url.endsWith('/auth/me')) return json({ user: { id: 'u', username: 'admin', role: 'admin' } }); if (url.endsWith('/libraries')) return json({ libraries: [{ id: 'l', name: 'Movies' }] }); return json({ featured: { id: 'm1', title: 'Local Film', kind: 'movie', hasLocalTrailer: true }, sections: [{ id: 'movies', title: 'Movies', items: [{ id: 'm1', title: 'Local Film', kind: 'movie' }] }] }); });
    render(<Home />);
    expect(await screen.findByRole('link', { name: 'Fullscreen trailer' })).toHaveAttribute('href', '/trailer/m1');
  });

  it('opens the random picker from the navbar', async () => {
    globalThis.fetch = vi.fn(async (input) => { const url = String(input); if (url.endsWith('/setup/status')) return json({ setupRequired: false }); if (url.endsWith('/auth/me')) return json({ user: { id: 'u', username: 'member', role: 'member' } }); if (url.endsWith('/libraries')) return json({ libraries: [] }); if (url.endsWith('/catalog/categories')) return json({ categories: [] }); throw new Error(`Unexpected request ${url}`); });
    render(<Home />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Random pick' }))[0]);
    expect(await screen.findByRole('heading', { name: 'Pick something to watch' })).toBeInTheDocument();
  });

});

describe('Live catalog updates', () => {
  const originalFetch = globalThis.fetch;
  const originalWebSocket = globalThis.WebSocket;
  afterEach(() => { globalThis.fetch = originalFetch; globalThis.WebSocket = originalWebSocket; vi.useRealTimers(); });

  /** A controllable stand-in for the browser socket. */
  class FakeWebSocket {
    static instance: FakeWebSocket | undefined;
    onopen: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onclose: (() => void) | null = null;
    readonly url: string;
    closed = false;
    constructor(url: string) { this.url = url; FakeWebSocket.instance = this; }
    close() { this.closed = true; }
    push(message: unknown) { this.onmessage?.({ data: JSON.stringify(message) }); }
  }

  function catalogWith(titles: string[]) {
    return {
      sections: [{
        id: 'newly-added', title: 'Newly Added', layout: 'card',
        items: titles.map((title, index) => ({ id: `id-${title}`, title, year: 2020 + index, kind: 'movie' })),
      }],
    };
  }

  it('fades a pushed title into the home rows without reloading', async () => {
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
    let payload = catalogWith(['Arrival']);
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/v1/setup/status') return json({ setupRequired: false });
      if (url === '/api/v1/auth/me') return json({ user: { id: 'u1', username: 'filip', role: 'member' } });
      if (url === '/api/v1/libraries') return json({ libraries: [{ id: 'l1', name: 'Movies', kind: 'movies' }] });
      if (url.startsWith('/api/v1/catalog/home')) return json(payload);
      throw new Error(`Unexpected request ${url}`);
    }) as unknown as typeof fetch;

    render(<Home />);
    expect((await screen.findAllByText('Arrival')).length).toBeGreaterThan(0);
    await waitFor(() => expect(FakeWebSocket.instance).toBeDefined());
    expect(FakeWebSocket.instance!.url).toContain('/api/v1/events');

    // The server announces new media; the page refetches and the new card fades in.
    payload = catalogWith(['Arrival', 'Dune']);
    FakeWebSocket.instance!.push({ type: 'catalog.updated', reason: 'added' });

    const dune = await screen.findAllByText('Dune', undefined, { timeout: 5000 });
    expect(dune.length).toBeGreaterThan(0);
    const appearing = document.querySelectorAll('.media-appear');
    expect(appearing).toHaveLength(1);
    expect(appearing[0].textContent).toContain('Dune');
    // The title that was already on screen does not re-animate.
    expect(document.querySelector('[data-appearing]')?.textContent).not.toContain('Arrival');
  });
});
