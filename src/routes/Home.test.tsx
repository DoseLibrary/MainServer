import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Home } from './Home';
import { cacheKeys, cachedValue } from '@/lib/cache';

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
    expect(await screen.findByRole('link', { name: 'Fullscreen trailer' })).toHaveAttribute('href', '/trailer/m1?back=%2F');
  });

  it('opens the random picker from the account menu', async () => {
    globalThis.fetch = vi.fn(async (input) => { const url = String(input); if (url.endsWith('/setup/status')) return json({ setupRequired: false }); if (url.endsWith('/auth/me')) return json({ user: { id: 'u', username: 'member', role: 'member' } }); if (url.endsWith('/libraries')) return json({ libraries: [] }); if (url.endsWith('/catalog/categories')) return json({ categories: [] }); throw new Error(`Unexpected request ${url}`); });
    render(<Home />);
    const accountButton = (await screen.findAllByRole('button', { name: /Account menu/ }))[0];
    fireEvent.pointerDown(accountButton); fireEvent.click(accountButton);
    fireEvent.click(await screen.findByRole('menuitem', { name: /Random pick/ }));
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

  it('holds the hero steady while a scan updates the rows beneath it', async () => {
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
    // The server picks the billboard at random on every fetch, so a refetch
    // mid-scan would otherwise swap out whatever the viewer is reading.
    let payload: Record<string, unknown> = { featured: { id: 'id-Solaris', title: 'Solaris', kind: 'movie' }, ...catalogWith(['Solaris']) };
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/v1/setup/status') return json({ setupRequired: false });
      if (url === '/api/v1/auth/me') return json({ user: { id: 'u1', username: 'filip', role: 'member' } });
      if (url === '/api/v1/libraries') return json({ libraries: [{ id: 'l1', name: 'Movies', kind: 'movies' }] });
      if (url.startsWith('/api/v1/catalog/home')) return json(payload);
      throw new Error(`Unexpected request ${url}`);
    }) as unknown as typeof fetch;

    render(<Home />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Solaris' })).toBeInTheDocument();
    await waitFor(() => expect(FakeWebSocket.instance).toBeDefined());

    payload = { featured: { id: 'id-Stalker', title: 'Stalker', kind: 'movie' }, ...catalogWith(['Solaris', 'Stalker']) };
    FakeWebSocket.instance!.push({ type: 'catalog.updated', reason: 'added' });

    await screen.findAllByText('Stalker', undefined, { timeout: 5000 });
    expect(screen.getByRole('heading', { level: 1, name: 'Solaris' })).toBeInTheDocument();
  });
});

describe('Snappy navigation', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  function library(handler?: (url: string) => Response | undefined) {
    return vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const custom = handler?.(url);
      if (custom) return custom;
      if (url === '/api/v1/setup/status') return json({ setupRequired: false });
      if (url === '/api/v1/auth/me') return json({ user: { id: 'u1', username: 'filip', role: 'member' } });
      if (url === '/api/v1/libraries') return json({ libraries: [{ id: 'l1', name: 'Movies', kind: 'movies' }] });
      if (url.startsWith('/api/v1/catalog/home')) return json({ sections: [{ id: 'newly-added', title: 'Newly Added', layout: 'card', items: [{ id: 'm1', title: 'Arrival', kind: 'movie' }] }] });
      if (url === '/api/v1/catalog/items/m1') return json({ item: { id: 'm1', title: 'Arrival', kind: 'movie' } });
      throw new Error(`Unexpected request ${url}`);
    });
  }

  it('shows the shape of the page while it loads, not a bare spinner', async () => {
    let release!: (value: Response) => void;
    const fetchMock = library((url) => {
      if (!url.startsWith('/api/v1/catalog/home')) return undefined;
      return undefined;
    });
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/v1/catalog/home')) return new Promise<Response>((resolve) => { release = resolve; });
      return fetchMock(input);
    }) as unknown as typeof fetch;

    const { container } = render(<Home />);

    await waitFor(() => expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(4));
    release(json({ sections: [] }));
  });

  it('warms a title on hover so opening it needs no round trip', async () => {
    const fetchMock = library();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    render(<Home />);

    const card = (await screen.findAllByText('Arrival'))[0];
    const requested = () => fetchMock.mock.calls.filter(([url]) => String(url) === '/api/v1/catalog/items/m1').length;
    expect(requested()).toBe(0);

    const wrapper = card.closest('div')!;
    fireEvent.pointerEnter(wrapper);
    await waitFor(() => expect(requested()).toBeGreaterThan(0));

    // Once warm, hovering again costs nothing: the click will read from cache.
    // Once warm, hovering again costs nothing: the click reads from cache.
    const settled = requested();
    await waitFor(() => expect(cachedValue(cacheKeys.catalogItem('m1'))).toBeDefined());
    fireEvent.pointerEnter(wrapper);
    expect(requested()).toBe(settled);
  });
});
