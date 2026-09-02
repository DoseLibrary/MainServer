import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MovieNightTv } from './MovieNightTv';

// The real generator is slow enough in jsdom to race the assertion below; the
// component only ever hands the result to an <img src>, so a stub data URL is
// all this screen needs to be exercised.
vi.mock('qrcode', () => ({ default: { toDataURL: async () => 'data:image/png;base64,AAA' } }));

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
class FakeSocket {
  static last: FakeSocket | undefined;
  onopen: (() => void) | null = null; onmessage: ((e: { data: string }) => void) | null = null; onclose: ((e: { code: number }) => void) | null = null;
  constructor(readonly url: string) { FakeSocket.last = this; }
  close() {}
  push(message: unknown) { this.onmessage?.({ data: JSON.stringify(message) }); }
}
const baseState = {
  code: 'AAAA-BBBB', phase: 'lobby', deckSize: 12,
  participants: [] as Array<{ id: string; nickname: string; joinedAt: number }>,
  matches: [] as Array<{ id: string; title: string }>,
  dismissed: [] as string[],
  allDone: false,
};

function mockApi(overrides: Partial<typeof baseState> = {}) {
  const calls: string[] = [];
  let state = { ...baseState, ...overrides };
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); calls.push(`${init?.method ?? 'GET'} ${url}`);
    if (url.endsWith('/auth/me')) return json({ user: { id: 'host-1', username: 'owner', role: 'admin', maxMaturityLevel: null } });
    if (url.endsWith('/catalog/categories')) return json({ categories: [{ key: 'drama', name: 'Drama', count: 4 }] });
    if (url.includes('/movie-night/count')) return json({ count: 12 });
    if (url.endsWith('/api/v1/movie-night') && init?.method === 'POST') return json({ code: 'AAAA-BBBB', joinPath: '/movie-night/join?code=AAAA-BBBB', deckSize: 12 });
    if (url.endsWith('/start')) { state = { ...state, phase: 'swiping' }; return json({ ok: true }); }
    if (url.endsWith('/dismiss/a') || url.endsWith('/end')) return json({ ok: true });
    if (url.endsWith('/leaders')) return json({ entries: [{ card: { id: 'a', title: 'Alpha' }, yes: 2, maybe: 0 }] });
    return json({ role: 'host', state });
  }) as unknown as typeof fetch;
  return calls;
}

const originalFetch = globalThis.fetch;
beforeEach(() => { vi.stubGlobal('WebSocket', FakeSocket); });
afterEach(() => { globalThis.fetch = originalFetch; sessionStorage.clear(); vi.unstubAllGlobals(); });
const renderTv = () => render(<MemoryRouter><MovieNightTv /></MemoryRouter>);

describe('MovieNightTv', () => {
  it('shows filters with a live count, then a lobby with a QR after starting', async () => {
    const calls = mockApi();
    renderTv();
    expect(await screen.findByText(/12 movies/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Genre'), { target: { value: 'drama' } });
    await waitFor(() => expect(calls.some((c) => c.includes('/movie-night/count?genre=drama'))).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'Create movie night' }));
    expect(await screen.findByText('AAAA-BBBB')).toBeInTheDocument();
    const qr = await screen.findByRole('img', { name: /QR code/ });
    await waitFor(() => expect(qr.getAttribute('src')).toBe('data:image/png;base64,AAA'));
    expect(sessionStorage.getItem('dose.movieNight.host')).toBe('AAAA-BBBB');
    expect(screen.getByRole('button', { name: 'Start swiping' })).toBeDisabled();
    FakeSocket.last?.push({ type: 'participant.joined', participant: { id: 'p1', nickname: 'Ann', joinedAt: 1 } });
    FakeSocket.last?.push({ type: 'participant.joined', participant: { id: 'p2', nickname: 'Bob', joinedAt: 2 } });
    expect(await screen.findByText('Bob')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start swiping' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Start swiping' }));
    await waitFor(() => expect(calls).toContain('POST /api/v1/movie-night/AAAA-BBBB/start'));
  });

  it('rejoins a stored session, shows progress and leaders, then the match', async () => {
    sessionStorage.setItem('dose.movieNight.host', 'AAAA-BBBB');
    mockApi({ phase: 'swiping', participants: [{ id: 'p1', nickname: 'Ann', joinedAt: 1 }] });
    renderTv();
    expect(await screen.findByText('Ann')).toBeInTheDocument();
    FakeSocket.last?.push({ type: 'progress', participantId: 'p1', done: 6, total: 12 });
    expect(await screen.findByText('6 / 12')).toBeInTheDocument();
    FakeSocket.last?.push({ type: 'leaders', entries: [{ card: { id: 'b', title: 'Beta' }, yes: 1, maybe: 0 }] });
    expect(await screen.findByText('Beta')).toBeInTheDocument();
    FakeSocket.last?.push({ type: 'match', card: { id: 'a', title: 'Alpha' } });
    expect(await screen.findByText("It's a match!")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Play now' })).toHaveAttribute('href', '/watch/a');
    fireEvent.click(screen.getByRole('button', { name: 'Keep swiping' }));
    await waitFor(() => expect(screen.queryByText("It's a match!")).not.toBeInTheDocument());
  });

  it('offers the ranked fallback when everyone is done without a match', async () => {
    sessionStorage.setItem('dose.movieNight.host', 'AAAA-BBBB');
    mockApi({ phase: 'swiping', allDone: true, participants: [{ id: 'p1', nickname: 'Ann', joinedAt: 1 }] });
    renderTv();
    expect(await screen.findByText(/No unanimous pick/)).toBeInTheDocument();
    expect(await screen.findByText('Alpha')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Alpha/ })).toHaveAttribute('href', '/watch/a');
  });

  it('shows a retry option when the deck count fails, and recovers after Retry', async () => {
    let countCalls = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) return json({ user: { id: 'host-1', username: 'owner', role: 'admin', maxMaturityLevel: null } });
      if (url.endsWith('/catalog/categories')) return json({ categories: [] });
      if (url.includes('/movie-night/count')) { countCalls += 1; return countCalls === 1 ? json({ message: 'boom' }, 500) : json({ count: 12 }); }
      return json({ role: 'host', state: baseState });
    }) as unknown as typeof fetch;

    render(<MemoryRouter><MovieNightTv /></MemoryRouter>);
    expect(await screen.findByText('Could not count the deck')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create movie night' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText(/12 movies/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create movie night' })).toBeEnabled();
  });

  it('ignores a stale allDone refetch that resolves after a newer one', async () => {
    sessionStorage.setItem('dose.movieNight.host', 'AAAA-BBBB');
    const resolvers: Array<() => void> = [];
    const allDoneByIndex = [false, false, true];
    let stateCall = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) return json({ user: { id: 'host-1', username: 'owner', role: 'admin', maxMaturityLevel: null } });
      if (url.endsWith('/leaders')) return json({ entries: [] });
      if (/\/movie-night\/AAAA-BBBB$/.test(url)) {
        const index = stateCall; stateCall += 1;
        return new Promise<Response>((resolve) => {
          resolvers[index] = () => resolve(json({ role: 'host', state: { ...baseState, phase: 'swiping', allDone: allDoneByIndex[index] } }));
        });
      }
      return json({ ok: true });
    }) as unknown as typeof fetch;

    renderTv();
    await waitFor(() => expect(resolvers[0]).toBeDefined());
    resolvers[0]();
    expect(await screen.findByText('Swiping…')).toBeInTheDocument();

    // Two progress messages fire two overlapping allDone refetches.
    FakeSocket.last?.push({ type: 'progress', participantId: 'p1', done: 1, total: 12 });
    await waitFor(() => expect(resolvers[1]).toBeDefined());
    FakeSocket.last?.push({ type: 'progress', participantId: 'p1', done: 2, total: 12 });
    await waitFor(() => expect(resolvers[2]).toBeDefined());

    // The newer (index 2, allDone: true) resolves first; the stale (index 1, allDone: false)
    // resolves after it and must not overwrite the newer result.
    resolvers[2]();
    expect(await screen.findByText(/No unanimous pick/)).toBeInTheDocument();
    resolvers[1]();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByText(/No unanimous pick/)).toBeInTheDocument();
  });

  it('resets count and any leftover error when starting another night', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) return json({ user: { id: 'host-1', username: 'owner', role: 'admin', maxMaturityLevel: null } });
      if (url.endsWith('/catalog/categories')) return json({ categories: [] });
      if (url.includes('/movie-night/count')) return json({ count: 12 });
      if (url.endsWith('/api/v1/movie-night') && init?.method === 'POST') return json({ code: 'AAAA-BBBB', joinPath: '/movie-night/join?code=AAAA-BBBB', deckSize: 12 });
      if (url.endsWith('/end')) return json({ message: 'boom' }, 500);
      return json({ role: 'host', state: baseState });
    }) as unknown as typeof fetch;

    renderTv();
    expect(await screen.findByText(/12 movies/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create movie night' }));
    expect(await screen.findByText('AAAA-BBBB')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText('boom')).toBeInTheDocument();
    FakeSocket.last?.push({ type: 'ended' });
    expect(await screen.findByText('Night ended')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start another' }));
    expect(await screen.findByText('Counting…')).toBeInTheDocument();
    expect(screen.queryByText('boom')).not.toBeInTheDocument();
    expect(await screen.findByText(/12 movies/)).toBeInTheDocument();
  });
});
