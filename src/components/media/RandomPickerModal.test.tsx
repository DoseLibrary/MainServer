import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RandomPickerModal } from './RandomPickerModal';

function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }); }

describe('RandomPickerModal', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('loads genres, applies filters, and navigates to the picked title', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(json({ categories: [{ key: 'science-fiction', name: 'Science Fiction', count: 2 }] })).mockResolvedValueOnce(json({ item: { id: 'movie-1', title: 'Arrival', kind: 'movie' } }));
    const navigate = vi.fn();
    render(<RandomPickerModal open onOpenChange={vi.fn()} onNavigate={navigate} />);
    fireEvent.change(await screen.findByLabelText('Genre'), { target: { value: 'science-fiction' } });
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'movie' } });
    fireEvent.change(screen.getByLabelText('From year'), { target: { value: '2000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pick with filters' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/media/movie-1'));
    expect(globalThis.fetch).toHaveBeenLastCalledWith('/api/v1/catalog/random?kind=movie&genre=science-fiction&yearMin=2000', expect.anything());
  });

  it('shows a helpful empty state for a 404', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(json({ categories: [] })).mockResolvedValueOnce(json({ error: 'No titles match these filters' }, 404));
    render(<RandomPickerModal open onOpenChange={vi.fn()} onNavigate={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Surprise me' }));
    expect(await screen.findByText(/Nothing matches/i)).toBeInTheDocument();
  });
});
