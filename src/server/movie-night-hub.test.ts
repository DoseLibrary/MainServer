import { describe, expect, it, vi } from 'vitest';
import { MovieNightHub } from './movie-night-hub.ts';
import type { MovieNightEvent } from './movie-night-service.ts';
import type { RealtimeSocket } from './realtime.ts';

function fakeSocket(readyState = 1) {
  const listeners = new Map<string, () => void>();
  return {
    readyState, sent: [] as string[],
    send(data: string) { this.sent.push(data); },
    close: vi.fn(),
    on(event: string, listener: () => void) { listeners.set(event, listener); },
    emit(event: string) { listeners.get(event)?.(); },
  };
}

function hubWithEmitter() {
  let listener: ((event: MovieNightEvent) => void) | undefined;
  const hub = new MovieNightHub({ onEvent: (next) => { listener = next; return () => { listener = undefined; }; } });
  return { hub, emit: (event: MovieNightEvent) => listener?.(event) };
}

describe('MovieNightHub', () => {
  it('routes events to the sockets of one session, host-only frames to the host', () => {
    const { hub, emit } = hubWithEmitter();
    const tv = fakeSocket(); const phone = fakeSocket(); const otherNight = fakeSocket();
    hub.add('AAAA-AAAA', tv as unknown as RealtimeSocket, 'host');
    hub.add('AAAA-AAAA', phone as unknown as RealtimeSocket, 'participant');
    hub.add('BBBB-BBBB', otherNight as unknown as RealtimeSocket, 'host');

    emit({ code: 'AAAA-AAAA', audience: 'all', message: { type: 'phase.changed', phase: 'swiping' } });
    emit({ code: 'AAAA-AAAA', audience: 'host', message: { type: 'leaders', entries: [] } });

    expect(tv.sent.map((f) => JSON.parse(f).type)).toEqual(['phase.changed', 'leaders']);
    expect(phone.sent.map((f) => JSON.parse(f).type)).toEqual(['phase.changed']);
    expect(otherNight.sent).toHaveLength(0);
    expect(hub.connections('AAAA-AAAA')).toBe(2);
  });

  it('drops closed or throwing sockets and closes everyone when a night ends', () => {
    const { hub, emit } = hubWithEmitter();
    const healthy = fakeSocket(); const gone = fakeSocket(); const broken = fakeSocket();
    broken.send = () => { throw new Error('gone'); };
    for (const s of [healthy, gone, broken]) hub.add('AAAA-AAAA', s as unknown as RealtimeSocket, 'participant');
    gone.emit('close');
    emit({ code: 'AAAA-AAAA', audience: 'all', message: { type: 'progress', participantId: 'p', done: 1, total: 3 } });
    expect(hub.connections('AAAA-AAAA')).toBe(1);

    emit({ code: 'AAAA-AAAA', audience: 'all', message: { type: 'ended' } });
    expect(JSON.parse(healthy.sent.at(-1)!)).toEqual({ type: 'ended' });
    expect(healthy.close).toHaveBeenCalledWith(4000, 'Movie night ended');
    expect(hub.connections('AAAA-AAAA')).toBe(0);
  });

  it('removes the room entry once its last socket is pruned during a non-ended dispatch', () => {
    const { hub, emit } = hubWithEmitter();
    const broken = fakeSocket();
    broken.send = () => { throw new Error('gone'); };
    hub.add('AAAA-AAAA', broken as unknown as RealtimeSocket, 'participant');

    emit({ code: 'AAAA-AAAA', audience: 'all', message: { type: 'phase.changed', phase: 'swiping' } });

    expect(hub.connections('AAAA-AAAA')).toBe(0);
    // The room entry itself must be gone, not merely empty, or it would leak forever.
    expect((hub as unknown as { rooms: Map<string, unknown> }).rooms.size).toBe(0);
  });
});
