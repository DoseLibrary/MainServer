import { render, screen } from '@testing-library/react';
import { MediaAdmin } from './MediaAdmin';

describe('MediaAdmin', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('lists titles with an archived badge and per-title actions', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [
      { id: 'm1', title: 'Inception', year: 2010, kind: 'movie', library: 'Movies', archived: false, archivedAt: null, posterUrl: '/api/v1/images/p.jpg' },
      { id: 's1', title: 'Old Show', year: 2001, kind: 'series', library: 'Shows', archived: true, archivedAt: '2026-08-30T00:00:00Z' },
    ], total: 2 }), { status: 200 }));

    render(<MediaAdmin open onOpenChange={() => {}} />);

    expect(await screen.findByText('Inception')).toBeInTheDocument();
    expect(screen.getByText('Old Show')).toBeInTheDocument();
    // Both the filter toggle and the archived title's badge read "Archived".
    expect(screen.getAllByText('Archived').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByRole('button', { name: 'Re-match' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(2);
  });
});
