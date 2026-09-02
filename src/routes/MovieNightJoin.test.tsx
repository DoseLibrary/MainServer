import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MovieNightJoin } from './MovieNightJoin';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const cards = [{ id: 'a', title: 'Alpha' }, { id: 'b', title: 'Beta' }];

class FakeSocket {
  static last: FakeSocket | undefined;
  onopen: (() => void) | null = null; onmessage: ((e: { data: string }) => void) | null = null; onclose: ((e: { code: number }) => void) | null = null;
  constructor(readonly url: string) { FakeSocket.last = this; }
  close() {}
  push(message: unknown) { this.onmessage?.({ data: JSON.stringify(message) }); }
}

function mockApi(state: { phase: string; votes?: Record<string, string> }) {
  const calls: string[] = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); calls.push(`${init?.method ?? 'GET'} ${url}`);
    if (url.endsWith('/join')) return json({ participantId: 'p1', token: 'tok' });
    if (url.endsWith('/deck')) return json({ cards });
    if (url.endsWith('/votes/a') || url.endsWith('/votes/b')) return json({ ok: true });
    if (url.endsWith('/participants/p1')) return json({ ok: true });
    return json({ role: 'participant', state: { code: 'AAAA-BBBB', phase: state.phase, deckSize: 2, participants: [{ id: 'p1', nickname: 'Ann', joinedAt: 1 }], matches: [], dismissed: [], allDone: false, votes: state.votes ?? {}, participantId: 'p1' } });
  }) as unknown as typeof fetch;
  return calls;
}

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; localStorage.clear(); vi.unstubAllGlobals(); });
beforeEach(() => {
  vi.stubGlobal('WebSocket', FakeSocket);
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 300 });
  HTMLElement.prototype.setPointerCapture = vi.fn(); HTMLElement.prototype.releasePointerCapture = vi.fn();
});

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><MovieNightJoin /></MemoryRouter>);
}

describe('MovieNightJoin (the phone)', () => {
  it('joins with a nickname, stores the token, and waits for the host', async () => {
    const calls = mockApi({ phase: 'lobby' });
    renderAt('/movie-night/join?code=AAAA-BBBB');
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Ann' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    expect(await screen.findByText(/Waiting for the host/)).toBeInTheDocument();
    expect(calls).toContain('POST /api/v1/movie-night/AAAA-BBBB/join');
    expect(JSON.parse(localStorage.getItem('dose.movieNight.AAAA-BBBB')!)).toEqual({ participantId: 'p1', token: 'tok' });
  });

  it('rejoins from a stored token and resumes at the first unvoted card', async () => {
    localStorage.setItem('dose.movieNight.AAAA-BBBB', JSON.stringify({ participantId: 'p1', token: 'tok' }));
    mockApi({ phase: 'swiping', votes: { a: 'no' } });
    renderAt('/movie-night/join?code=AAAA-BBBB');
    expect(await screen.findByRole('heading', { name: 'Beta' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Alpha' })).not.toBeInTheDocument();
  });

  it('votes through the buttons and shows the match when the socket says so', async () => {
    localStorage.setItem('dose.movieNight.AAAA-BBBB', JSON.stringify({ participantId: 'p1', token: 'tok' }));
    const calls = mockApi({ phase: 'swiping' });
    renderAt('/movie-night/join?code=AAAA-BBBB');
    await screen.findByRole('heading', { name: 'Alpha' });
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    const top = screen.getAllByTestId('swipe-card').find((el) => el.dataset.depth === '0')!;
    fireEvent.transitionEnd(top);
    await waitFor(() => expect(calls).toContain('PUT /api/v1/movie-night/AAAA-BBBB/votes/a'));
    expect(await screen.findByRole('heading', { name: 'Beta' })).toBeInTheDocument();
    FakeSocket.last?.push({ type: 'match', card: cards[0] });
    expect(await screen.findByText("It's a match!")).toBeInTheDocument();
    FakeSocket.last?.push({ type: 'match.dismissed', cardId: 'a' });
    await waitFor(() => expect(screen.queryByText("It's a match!")).not.toBeInTheDocument());
  });

  it('clears the token and says goodbye when the night ends', async () => {
    localStorage.setItem('dose.movieNight.AAAA-BBBB', JSON.stringify({ participantId: 'p1', token: 'tok' }));
    mockApi({ phase: 'swiping' });
    renderAt('/movie-night/join?code=AAAA-BBBB');
    await screen.findByRole('heading', { name: 'Alpha' });
    FakeSocket.last?.push({ type: 'ended' });
    expect(await screen.findByText(/Night over/)).toBeInTheDocument();
    expect(localStorage.getItem('dose.movieNight.AAAA-BBBB')).toBeNull();
  });
});
