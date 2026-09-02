import type { MovieNightEvent, MovieNightService } from './movie-night-service.ts';
import type { RealtimeSocket } from './realtime.ts';

const OPEN = 1;

interface Member { socket: RealtimeSocket; role: 'host' | 'participant' }

/**
 * Fans movie-night events out to the sockets of one session. Frames are the
 * bare message; `host` audience frames reach only the TV so phones never see
 * aggregate votes.
 */
export class MovieNightHub {
  private readonly rooms = new Map<string, Set<Member>>();
  private readonly unsubscribe: () => void;

  constructor(service: Pick<MovieNightService, 'onEvent'>) {
    this.unsubscribe = service.onEvent((event) => this.dispatch(event));
  }

  add(code: string, socket: RealtimeSocket, role: 'host' | 'participant'): void {
    const room = this.rooms.get(code) ?? new Set<Member>();
    this.rooms.set(code, room);
    const member: Member = { socket, role };
    room.add(member);
    const drop = () => { room.delete(member); if (room.size === 0) this.rooms.delete(code); };
    socket.on('close', drop);
    socket.on('error', drop);
  }

  connections(code: string): number { return this.rooms.get(code)?.size ?? 0; }

  private dispatch(event: MovieNightEvent): void {
    const room = this.rooms.get(event.code);
    if (!room) return;
    const data = JSON.stringify(event.message);
    for (const member of [...room]) {
      if (event.audience === 'host' && member.role !== 'host') continue;
      try { if (member.socket.readyState === OPEN) member.socket.send(data); else room.delete(member); }
      catch { room.delete(member); }
    }
    if (event.message.type === 'ended') {
      for (const member of room) { try { member.socket.close(4000, 'Movie night ended'); } catch { /* gone */ } }
      this.rooms.delete(event.code);
    }
  }

  closeAll(): void {
    this.unsubscribe();
    for (const room of this.rooms.values()) {
      for (const member of room) { try { member.socket.close(1001, 'Server shutting down'); } catch { /* gone */ } }
    }
    this.rooms.clear();
  }
}
