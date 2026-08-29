import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LibraryManager } from './LibraryManager';
import type { Library } from '@/lib/api';

const library = { id: 'lib-1', name: 'Movies', kind: 'movies' as const, rootPath: '/media/movies' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('LibraryManager scans', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; vi.useRealTimers(); });

  it('polls without overlap and reports completion', async () => {
    vi.useFakeTimers();
    let resolveLatest!: (value: Response) => void;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ scan: null }))
      .mockResolvedValueOnce(json({ scan: { id: 's1', libraryId: 'lib-1', status: 'queued' } }, 202))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveLatest = resolve; }));
    globalThis.fetch = fetchMock;
    const completed = vi.fn();
    render(<LibraryManager open libraries={[library]} onOpenChange={() => undefined} onChanged={() => undefined} onError={() => undefined} onScanCompleted={completed} />);
    await act(async () => Promise.resolve());
    fireEvent.click(screen.getByRole('button', { name: 'Scan' }));
    await act(async () => Promise.resolve());
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await act(async () => { vi.advanceTimersByTime(5000); await Promise.resolve(); });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await act(async () => { resolveLatest(json({ scan: { id: 's1', libraryId: 'lib-1', status: 'completed', processedFiles: 8, discoveredFiles: 8 } })); await Promise.resolve(); });
    expect(screen.getByText(/Scan completed/)).toBeInTheDocument();
    expect(completed).toHaveBeenCalledOnce();
  });

  it('shows scan failures and enables retry', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(json({ scan: null }))
      .mockResolvedValueOnce(json({ scan: { id: 's1', libraryId: 'lib-1', status: 'failed', error: 'TMDB rate limit exhausted' } }, 202))
      .mockResolvedValueOnce(json({ scan: { id: 's1', libraryId: 'lib-1', status: 'failed', error: 'TMDB rate limit exhausted' } }));
    render(<LibraryManager open libraries={[library]} onOpenChange={() => undefined} onChanged={() => undefined} onError={() => undefined} />);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Scan' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('TMDB rate limit exhausted');
    expect(screen.getByRole('button', { name: 'Retry scan' })).toBeEnabled();
  });

  it('stops scheduling requests after unmount', async () => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(json({ scan: null }))
      .mockResolvedValueOnce(json({ scan: { id: 's1', libraryId: 'lib-1', status: 'running' } }, 202))
      .mockResolvedValueOnce(json({ scan: { id: 's1', libraryId: 'lib-1', status: 'running' } }));
    const view = render(<LibraryManager open libraries={[library]} onOpenChange={() => undefined} onChanged={() => undefined} onError={() => undefined} />);
    await act(async () => Promise.resolve());
    fireEvent.click(screen.getByRole('button', { name: 'Scan' }));
    await act(async () => Promise.resolve());
    const calls = vi.mocked(globalThis.fetch).mock.calls.length;
    view.unmount();
    await act(async () => { vi.advanceTimersByTime(5000); await Promise.resolve(); });
    expect(globalThis.fetch).toHaveBeenCalledTimes(calls);
  });

  it('invalidates stale responses across close and reopen', async () => {
    let resolveOld!: (response: Response) => void;
    globalThis.fetch = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveOld = resolve; }))
      .mockResolvedValueOnce(json({ scan: { id: 'new', libraryId: 'lib-1', status: 'completed', processedFiles: 3, discoveredFiles: 3 } }));
    const props = { libraries: [library], onOpenChange: () => undefined, onChanged: () => undefined, onError: vi.fn() };
    const view = render(<LibraryManager open {...props} />);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
    view.rerender(<LibraryManager open={false} {...props} />);
    view.rerender(<LibraryManager open {...props} />);
    expect(await screen.findByText(/Scan completed/)).toHaveTextContent('3/3 files');
    await act(async () => { resolveOld(json({ scan: { id: 'old', libraryId: 'lib-1', status: 'failed', error: 'stale failure' } })); await Promise.resolve(); });
    expect(screen.queryByText(/stale failure/)).not.toBeInTheDocument();
    expect(props.onError).not.toHaveBeenCalled();
  });

  it('creates and explicitly confirms deletion of a library', async () => {
    const newLibrary = { id: 'lib-1', name: 'Family Shows', kind: 'shows' as const, rootPath: '/media/shows' };
    let libraries: Library[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input); const method = init?.method ?? 'GET';
      if (url === '/api/v1/libraries' && method === 'POST') { libraries = [newLibrary]; return json({ library: newLibrary }, 201); }
      if (url === '/api/v1/libraries' && method === 'GET') return json({ libraries });
      if (url === '/api/v1/libraries/lib-1' && method === 'DELETE') { libraries = []; return new Response(null, { status: 204 }); }
      if (url.includes('/scans/latest')) return json({ scan: null });
      throw new Error(`Unexpected request ${method} ${url}`);
    });
    globalThis.fetch = fetchMock;

    function Harness() {
      const [libs, setLibs] = useState<Library[]>([]);
      const [error, setError] = useState<string>();
      return <LibraryManager open libraries={libs} onOpenChange={() => undefined} onChanged={setLibs} onError={setError} error={error} />;
    }
    render(<Harness />);

    fireEvent.change(screen.getByLabelText('Library name'), { target: { value: 'Family Shows' } });
    fireEvent.change(screen.getByLabelText('Media type'), { target: { value: 'shows' } });
    fireEvent.change(screen.getByLabelText('Media path'), { target: { value: '/media/shows' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add library' }));

    expect(await screen.findByText('/media/shows')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('heading', { name: 'Delete Family Shows?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }));
    expect(await screen.findByText('No libraries configured.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/libraries/lib-1', expect.objectContaining({ method: 'DELETE' }));
  });
});
