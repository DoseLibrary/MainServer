import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CollectionPage } from './CollectionPage';

const COLLECTION = '60000000-0000-4000-8000-000000000001';

function renderPage() {
  render(
    <MemoryRouter initialEntries={[`/collection/${COLLECTION}`]}>
      <Routes><Route path="/collection/:id" element={<CollectionPage />} /></Routes>
    </MemoryRouter>,
  );
}

describe('CollectionPage', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('renders missing members as greyed, non-navigable placeholders', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ collection: {
      id: COLLECTION, name: 'Saga', titles: [{ id: 'm1', title: 'One', year: 2020, kind: 'movie' }],
      missing: [{ tmdbId: '101', title: 'Two', year: 2022, inLibrary: false }],
    } }), { status: 200 }));
    renderPage();

    expect(await screen.findByRole('link', { name: /One/ })).toHaveAttribute('href', '/media/m1');
    const gap = screen.getByTestId('collection-gap');
    expect(within(gap).getByText('Two')).toBeInTheDocument();
    expect(within(gap).getByText('Not in library')).toBeInTheDocument();
    expect(within(gap).queryByRole('link')).toBeNull();
    expect(within(gap).queryByRole('button')).toBeNull();
  });

  it('omits placeholders when the response carries no gaps', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ collection: {
      id: COLLECTION, name: 'Saga', titles: [{ id: 'm1', title: 'One', year: 2020, kind: 'movie' }],
    } }), { status: 200 }));
    renderPage();

    expect(await screen.findByRole('link', { name: /One/ })).toBeInTheDocument();
    expect(screen.queryByTestId('collection-gap')).toBeNull();
  });
});
