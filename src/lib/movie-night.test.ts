import { renderHook, act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { clearParticipant, loadParticipant, saveParticipant, socketUrl, useMovieNightSocket } from './movie-night';

class FakeSocket {
  static instances: FakeSocket[] = [];
  onopen: (() => void) | null = null; onmessage: ((e: { data: string }) => void) | null = null; onclose: ((e: { code: number }) => void) | null = null;
  closed = false;
  constructor(readonly url: string) { FakeSocket.instances.push(this); }
  close() { this.closed = true; }
}

afterEach(() => { FakeSocket.instances = []; vi.unstubAllGlobals(); vi.useRealTimers(); localStorage.clear(); });

describe('participant storage', () => {
  it('round-trips per code and normalizes the key', () => {
    saveParticipant('abcd-efgh', { participantId: 'p1', token: 't' });
    expect(loadParticipant('ABCD-EFGH')).toEqual({ participantId: 'p1', token: 't' });
    clearParticipant('ABCD-EFGH');
    expect(loadParticipant('ABCD-EFGH')).toBeUndefined();
  });
});

describe('api.movieNight', () => {
  it('sends the participant token as a bearer header', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await api.movieNight.vote('AAAA-BBBB', 'tok', 'card', 'yes');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/movie-night/AAAA-BBBB/votes/card');
    expect(init.method).toBe('PUT');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(init.body).toBe(JSON.stringify({ vote: 'yes' }));
  });
});

describe('useMovieNightSocket', () => {
  it('connects with the token, forwards frames, and stops after a terminal close', () => {
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', FakeSocket);
    const onMessage = vi.fn(); const onClose = vi.fn();
    renderHook(() => useMovieNightSocket('AAAA-BBBB', 'tok', onMessage, onClose));
    expect(FakeSocket.instances).toHaveLength(1);
    expect(FakeSocket.instances[0].url).toBe(socketUrl('AAAA-BBBB', 'tok'));
    act(() => { FakeSocket.instances[0].onopen?.(); FakeSocket.instances[0].onmessage?.({ data: JSON.stringify({ type: 'ended' }) }); });
    expect(onMessage).toHaveBeenCalledWith({ type: 'ended' });
    act(() => { FakeSocket.instances[0].onclose?.({ code: 4000 }); });
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(FakeSocket.instances).toHaveLength(1);
    expect(onClose).toHaveBeenCalledWith(4000);
  });

  it('reconnects with backoff after a network close', () => {
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', FakeSocket);
    renderHook(() => useMovieNightSocket('AAAA-BBBB', undefined, vi.fn()));
    act(() => { FakeSocket.instances[0].onclose?.({ code: 1006 }); });
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(FakeSocket.instances).toHaveLength(2);
    act(() => { FakeSocket.instances[1].onclose?.({ code: 1006 }); vi.advanceTimersByTime(1_000); });
    expect(FakeSocket.instances).toHaveLength(2);
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(FakeSocket.instances).toHaveLength(3);
  });
});
