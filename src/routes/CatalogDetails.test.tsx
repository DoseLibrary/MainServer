import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CatalogDetails } from './CatalogDetails';

describe('CatalogDetails', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });
  it('loads an encoded id and renders optional metadata safely', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ item: { id: 'movie/1', title: 'Arrival', year: 2016, kind: 'movie', overview: 'First contact.' } }), { status: 200 }));
    render(<MemoryRouter initialEntries={['/media/movie%2F1']}><Routes><Route path="/media/:id" element={<CatalogDetails />} /></Routes></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Arrival' })).toBeInTheDocument();
    expect(screen.getByText('First contact.')).toBeInTheDocument();
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/v1/catalog/items/movie%2F1', expect.anything());
  });

  it('climbs from an episode to its season and show', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ item: {
      id: 'e1', title: 'Opening', kind: 'episode', seasonNumber: 1, episodeNumber: 1,
      parent: { id: 's1', title: 'Season 1', kind: 'season', seasonNumber: 1 },
      series: { id: 'sh1', title: 'Art Show', kind: 'series' },
    } }), { status: 200 }));
    render(<MemoryRouter initialEntries={['/media/e1']}><Routes><Route path="/media/:id" element={<CatalogDetails />} /></Routes></MemoryRouter>);

    expect(await screen.findByRole('link', { name: 'Art Show' })).toHaveAttribute('href', '/media/sh1');
    expect(screen.getByRole('link', { name: 'Season 1' })).toHaveAttribute('href', '/media/s1');
    expect(screen.getByRole('link', { name: 'Back to Season 1' })).toHaveAttribute('href', '/media/s1');
  });

  it('adds a title to a personal collection from the media page', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/v1/me/collections/')) return new Response(JSON.stringify({ collection: { id: 'c1', name: 'Marathon', items: [] } }), { status: 200 });
      if (url === '/api/v1/me/collections') return new Response(JSON.stringify({ collections: [{ id: 'c1', name: 'Marathon', itemCount: 0 }] }), { status: 200 });
      if (url === '/api/v1/auth/me') return new Response(JSON.stringify({ user: { id: 'u1', username: 'member', role: 'member' } }), { status: 200 });
      return new Response(JSON.stringify({ item: { id: 'm9', title: 'Heat', kind: 'movie' } }), { status: 200 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    render(<MemoryRouter initialEntries={['/media/m9']}><Routes><Route path="/media/:id" element={<CatalogDetails />} /></Routes></MemoryRouter>);

    fireEvent.click(await screen.findByRole('button', { name: 'Add to collection' }));
    fireEvent.click(await screen.findByRole('button', { name: /Marathon/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/v1/me/collections/c1/items', expect.objectContaining({ method: 'POST', body: JSON.stringify({ mediaItemId: 'm9' }) })));
    expect(await screen.findByText('Added to Marathon.')).toBeInTheDocument();
  });

  it('queues a movie for the marathon from the media page', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/v1/me/queue') return new Response(JSON.stringify({ items: [{ id: 'm9', title: 'Heat', kind: 'movie' }] }), { status: 200 });
      if (url === '/api/v1/auth/me') return new Response(JSON.stringify({ user: { id: 'u1', username: 'member', role: 'member' } }), { status: 200 });
      return new Response(JSON.stringify({ item: { id: 'm9', title: 'Heat', kind: 'movie' } }), { status: 200 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    render(<MemoryRouter initialEntries={['/media/m9']}><Routes><Route path="/media/:id" element={<CatalogDetails />} /></Routes></MemoryRouter>);

    fireEvent.click(await screen.findByRole('button', { name: 'Add to queue' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/v1/me/queue', expect.objectContaining({ method: 'POST', body: JSON.stringify({ mediaItemId: 'm9' }) })));
    expect(await screen.findByRole('button', { name: 'In queue' })).toBeInTheDocument();
  });

  it('labels the primary action Resume for a partially watched movie', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ item: { id: 'm3', title: 'Dune', kind: 'movie', progress: 0.4 } }), { status: 200 }));
    render(<MemoryRouter initialEntries={['/media/m3']}><Routes><Route path="/media/:id" element={<CatalogDetails />} /></Routes></MemoryRouter>);
    expect(await screen.findByRole('link', { name: 'Resume' })).toHaveAttribute('href', '/watch/m3');
    expect(screen.getByRole('link', { name: 'Play from start' })).toHaveAttribute('href', '/watch/m3?start=0');
  });

  it('routes to the player in the client instead of reloading the app', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ item: { id: 'm5', title: 'Sicario', kind: 'movie' } }), { status: 200 }));
    render(<MemoryRouter initialEntries={['/media/m5']}><Routes>
      <Route path="/media/:id" element={<CatalogDetails />} />
      <Route path="/watch/:id" element={<p>Playing</p>} />
    </Routes></MemoryRouter>);

    fireEvent.click(await screen.findByRole('link', { name: 'Play' }));
    expect(await screen.findByText('Playing')).toBeInTheDocument();
  });

  it('offers only Play for a movie that has not been started', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ item: { id: 'm4', title: 'Heat', kind: 'movie' } }), { status: 200 }));
    render(<MemoryRouter initialEntries={['/media/m4']}><Routes><Route path="/media/:id" element={<CatalogDetails />} /></Routes></MemoryRouter>);
    expect(await screen.findByRole('link', { name: 'Play' })).toHaveAttribute('href', '/watch/m4');
    expect(screen.queryByRole('link', { name: 'Play from start' })).toBeNull();
  });
  it('shows when a movie would end and when it was added', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date('2026-03-14T20:00:00') });
    try {
      globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ item: {
        id: 'm6', title: 'Heat', kind: 'movie', progress: 0.5, addedAt: '2026-03-01T09:30:00.000Z',
        files: [{ id: 'f1', relativePath: 'Heat.mkv', durationSeconds: 7200 }],
      } }), { status: 200 }));
      render(<MemoryRouter initialEntries={['/media/m6']}><Routes><Route path="/media/:id" element={<CatalogDetails />} /></Routes></MemoryRouter>);
      await screen.findByRole('heading', { name: 'Heat' });
      // Half of two hours remains, so the film ends an hour from "now".
      const expected = new Date('2026-03-14T21:00:00').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      expect(screen.getByText(`Ends at ${expected}`)).toBeInTheDocument();
      const added = `Added ${new Date('2026-03-01T09:30:00.000Z').toLocaleDateString()}`;
      expect(screen.getByText((_, node) => node?.textContent?.trim().endsWith(added) === true && node.tagName === 'SPAN')).toBeInTheDocument();
    } finally { vi.useRealTimers(); }
  });

  it('leaves the ending time off a series page', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ item: { id: 's9', title: 'Lost', kind: 'series', files: [{ id: 'f1', relativePath: 'x', durationSeconds: 100 }] } }), { status: 200 }));
    render(<MemoryRouter initialEntries={['/media/s9']}><Routes><Route path="/media/:id" element={<CatalogDetails />} /></Routes></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Lost' });
    expect(screen.queryByText(/Ends at/)).toBeNull();
  });

  it('renders enriched movie details: quality badge, genres, tagline, cast, and recommendations', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ item: {
      id: 'm1', title: 'Inception', year: 2010, kind: 'movie', overview: 'A heist inside dreams.', tagline: 'Your mind is the scene of the crime.',
      runtime: '2h 28m', contentRating: 'PG-13', providerRating: 8.4,
      quality: { badge: '4K HDR', resolutionLabel: '4K', dynamicRange: 'HDR10', videoCodec: 'hevc', audioCodec: 'eac3', audioChannels: '5.1' },
      genres: [{ id: 'g1', name: 'Action' }, { id: 'g2', name: 'Sci-Fi' }],
      collection: { id: 'c1', name: 'Nolan Collection' },
      cast: [{ name: 'Leonardo DiCaprio', character: 'Cobb', profileUrl: '/api/v1/images/leo.jpg', order: 0 }],
      recommendations: [{ id: 'm2', title: 'Interstellar', kind: 'movie', year: 2014, posterUrl: '/api/v1/images/inter.jpg' }],
    } }), { status: 200 }));
    render(<MemoryRouter initialEntries={['/media/m1']}><Routes><Route path="/media/:id" element={<CatalogDetails />} /></Routes></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Inception' })).toBeInTheDocument();
    expect(screen.getByText('4K HDR')).toBeInTheDocument();
    expect(screen.getByText('Your mind is the scene of the crime.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Action' })).toHaveAttribute('href', '/genre/g1');
    expect(screen.getByRole('link', { name: 'Sci-Fi' })).toHaveAttribute('href', '/genre/g2');
    expect(screen.getByRole('link', { name: 'Nolan Collection' })).toHaveAttribute('href', '/collection/c1');
    expect(screen.getByText('Leonardo DiCaprio')).toBeInTheDocument();
    expect(screen.getByText('Cobb')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Interstellar/ })).toHaveAttribute('href', '/media/m2');
  });
  it('renders linked seasons returned for a series', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ item: { id: 'show-1', title: 'Severance', kind: 'series', children: [{ id: 'season-1', title: 'Season 1', kind: 'season', overview: 'Nine episodes.' }] } }), { status: 200 }));
    render(<MemoryRouter initialEntries={['/media/show-1']}><Routes><Route path="/media/:id" element={<CatalogDetails />} /></Routes></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Seasons' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Season 1' })).toHaveAttribute('href', '/media/season-1');
    expect(screen.getByText('Nine episodes.')).toBeInTheDocument();
  });
  it('renders a season as episodic context with linked episode children', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ item: {
      id: 'season/1', title: 'Season 1', kind: 'season', seasonNumber: 1, posterUrl: '/season.jpg',
      children: [
        { id: 'episode/1', title: 'Good News About Hell', kind: 'episode', seasonNumber: 1, episodeNumber: 1, overview: 'Mark starts a new job.', posterUrl: '/episode.jpg' },
        { id: 'episode/2', title: '', kind: 'episode', seasonNumber: 1, episodeNumber: 2 },
      ],
    } }), { status: 200 }));
    render(<MemoryRouter initialEntries={['/media/season%2F1']}><Routes><Route path="/media/:id" element={<CatalogDetails />} /></Routes></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Episodes' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Season 1' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Good News About Hell' })).toHaveAttribute('href', '/media/episode%2F1');
    expect(screen.getByRole('link', { name: 'Open Episode 2' })).toHaveAttribute('href', '/media/episode%2F2');
    expect(screen.getByText('Mark starts a new job.')).toBeInTheDocument();
  });
  it('uses only server-validated local trailers and hides stale remote-only records', async () => {
    globalThis.fetch = vi.fn(async (input) => String(input).endsWith('/auth/me') ? new Response(JSON.stringify({ user: { id: 'u', role: 'member' } }), { status: 200 }) : new Response(JSON.stringify({ item: { id: 'm1', title: 'Offline', kind: 'movie', hasLocalTrailer: false, trailers: [{ site: 'YouTube', key: 'remote', preferred: true, localAvailable: false }] } }), { status: 200 }));
    render(<MemoryRouter initialEntries={['/media/m1']}><Routes><Route path="/media/:id" element={<CatalogDetails />} /></Routes></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Offline' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Play Trailer' })).not.toBeInTheDocument();
  });

  it('lets an admin re-match metadata then opens artwork selection', async () => {
    globalThis.fetch = vi.fn(async (input) => {
      const url = String(input); if (url.endsWith('/auth/me')) return new Response(JSON.stringify({ user: { id: 'a', role: 'admin' } }), { status: 200 });
      if (url.includes('/admin/tmdb/search')) return new Response(JSON.stringify({ results: [{ id: 42, title: 'Correct Film', year: 2024 }] }), { status: 200 });
      if (url.endsWith('/admin/items/m1/match')) return new Response(JSON.stringify({ item: { id: 'm1', providerIds: { tmdb: '42' } } }), { status: 200 });
      if (url.endsWith('/catalog/items/m1/artwork')) return new Response(JSON.stringify({ posters: [], backdrops: [] }), { status: 200 });
      return new Response(JSON.stringify({ item: { id: 'm1', title: 'Wrong Film', kind: 'movie' } }), { status: 200 });
    });
    render(<MemoryRouter initialEntries={['/media/m1']}><Routes><Route path="/media/:id" element={<CatalogDetails />} /></Routes></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Wrong Film' });
    fireEvent.pointerDown(await screen.findByRole('button', { name: 'Change artwork' }), { button: 0, ctrlKey: false }); fireEvent.click(await screen.findByText('Re-match metadata'));
    fireEvent.click(screen.getByRole('button', { name: 'Search' })); fireEvent.click(await screen.findByRole('button', { name: 'Select' }));
    await waitFor(() => expect(screen.getByText('Change artwork')).toBeInTheDocument());
  });
});
