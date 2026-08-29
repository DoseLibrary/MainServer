import { render, screen } from '@testing-library/react';
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
    expect(screen.getByText(/Part of Nolan Collection/)).toBeInTheDocument();
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
});
