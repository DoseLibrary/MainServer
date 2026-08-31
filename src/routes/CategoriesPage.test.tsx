import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CategoriesPage } from './CategoriesPage';

describe('CategoriesPage', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('lists categories with counts linking to each category page', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ categories: [
      { key: 'action', name: 'Action', count: 12 },
      { key: 'science fiction', name: 'Science Fiction', count: 1 },
    ] }), { status: 200 }));
    render(<MemoryRouter initialEntries={['/categories']}><Routes><Route path="/categories" element={<CategoriesPage />} /></Routes></MemoryRouter>);

    const action = await screen.findByRole('link', { name: /Action/ });
    expect(action).toHaveAttribute('href', '/category/action');
    expect(screen.getByText('12 titles')).toBeInTheDocument();
    const scifi = screen.getByRole('link', { name: /Science Fiction/ });
    expect(scifi).toHaveAttribute('href', '/category/science%20fiction');
    expect(screen.getByText('1 title')).toBeInTheDocument();
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/v1/catalog/categories', expect.anything());
  });

  it('shows an empty state when there are no categories', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ categories: [] }), { status: 200 }));
    render(<MemoryRouter initialEntries={['/categories']}><Routes><Route path="/categories" element={<CategoriesPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByText(/No categories are available yet/)).toBeInTheDocument();
  });
});
