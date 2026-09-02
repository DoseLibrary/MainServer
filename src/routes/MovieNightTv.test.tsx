import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MovieNightTv } from './MovieNightTv';

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
    await waitFor(() => expect(qr.getAttribute('src')).toMatch(/^data:image\/png/));
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
});
