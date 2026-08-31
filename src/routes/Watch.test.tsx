import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Watch } from './Watch';

const ONE = '20000000-0000-4000-8000-000000000001';
const TWO = '20000000-0000-4000-8000-000000000002';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function mockPlayback(next: unknown) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith('/api/v1/me/queue/next')) return json({ item: next });
    if (url.includes('/playback')) return json({ plan: { mode: 'direct', container: 'mp4', remux: false, reasons: [] }, durationSeconds: 100, stream: { url: '/stream.mp4', direct: true } });
    if (url.includes('/sprites')) return json({ sprite: null });
    if (url.includes('/intro')) return json({ intro: { startSeconds: 10, endSeconds: 55 } });
    return json({ item: { id: ONE, title: 'One', kind: 'movie' } });
  });
}

function renderWatch(search: string) {
  render(
    <MemoryRouter initialEntries={[`/watch/${ONE}${search}`]}>
      <Routes><Route path="/watch/:id" element={<Watch />} /></Routes>
    </MemoryRouter>,
  );
}

const findVideo = async () => {
  await waitFor(() => expect(document.querySelector('video')).not.toBeNull());
  return document.querySelector('video') as HTMLVideoElement;
};

describe('Watch marathon mode', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('advances to the next queued title when playback ends', async () => {
    const fetchMock = mockPlayback({ id: TWO, title: 'Two', kind: 'movie' });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    renderWatch('?queue=1');

    const video = await findVideo();
    fireEvent.ended(video);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`/api/v1/me/queue/next?after=${ONE}`, expect.anything()));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`/api/v1/catalog/items/${TWO}`, expect.anything()));
  });

  it('ends quietly when the queue is exhausted', async () => {
    const fetchMock = mockPlayback(null);
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    renderWatch('?queue=1');

    const video = await findVideo();
    fireEvent.ended(video);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`/api/v1/me/queue/next?after=${ONE}`, expect.anything()));
    expect(fetchMock).not.toHaveBeenCalledWith(`/api/v1/catalog/items/${TWO}`, expect.anything());
  });

  it('does not touch the queue outside marathon mode', async () => {
    const fetchMock = mockPlayback({ id: TWO, title: 'Two', kind: 'movie' });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    renderWatch('');

    const video = await findVideo();
    fireEvent.ended(video);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`/api/v1/catalog/items/${ONE}/progress`, expect.objectContaining({ method: 'POST' })));
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/api/v1/me/queue/next'), expect.anything());
  });
});

describe('Skip intro', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('offers Skip intro only inside the detected segment and seeks past it', async () => {
    globalThis.fetch = mockPlayback(null) as unknown as typeof fetch;
    renderWatch('');
    const video = await findVideo();

    // Before the intro: no button.
    Object.defineProperty(video, 'currentTime', { value: 2, writable: true });
    fireEvent(video, new Event('timeupdate'));
    expect(screen.queryByRole('button', { name: 'Skip intro' })).not.toBeInTheDocument();

    // Inside the intro: the button appears and skips to its end.
    video.currentTime = 20;
    fireEvent(video, new Event('timeupdate'));
    fireEvent.click(await screen.findByRole('button', { name: 'Skip intro' }));
    expect(video.currentTime).toBe(55);

    fireEvent(video, new Event('timeupdate'));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Skip intro' })).not.toBeInTheDocument());
  });

  it('shows no skip control when the title has no marker', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/playback')) return json({ plan: { mode: 'direct', container: 'mp4', remux: false, reasons: [] }, durationSeconds: 100, stream: { url: '/stream.mp4', direct: true } });
      if (url.includes('/sprites')) return json({ sprite: null });
      if (url.includes('/intro')) return json({ intro: null });
      return json({ item: { id: ONE, title: 'One', kind: 'movie' } });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    renderWatch('');
    const video = await findVideo();

    Object.defineProperty(video, 'currentTime', { value: 20, writable: true });
    fireEvent(video, new Event('timeupdate'));
    expect(screen.queryByRole('button', { name: 'Skip intro' })).not.toBeInTheDocument();
  });
});
