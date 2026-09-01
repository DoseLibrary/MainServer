import '@testing-library/jest-dom/vitest';
import { beforeEach, vi } from 'vitest';
import { clearCache } from '@/lib/cache';

// The API cache is module state shared by every test in a file; each case
// starts from an empty one so a fixture cannot leak into the next.
beforeEach(() => { clearCache(); });

if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

// Screens subscribe to the live-update socket as they mount. jsdom hands that
// to undici, which then dispatches a real connection against a server that is
// not there and throws outside any test's control. A silent socket keeps the
// subscription code on its normal path without touching the network.
class SilentWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readyState = SilentWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  send() { /* nothing is listening */ }
  close() { this.readyState = SilentWebSocket.CLOSED; }
  addEventListener() { /* nothing is listening */ }
  removeEventListener() { /* nothing is listening */ }
}
vi.stubGlobal('WebSocket', SilentWebSocket);

// jsdom does not implement media playback; stub so the video hero can mount.
Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: vi.fn().mockResolvedValue(undefined) });
Object.defineProperty(HTMLMediaElement.prototype, 'pause', { configurable: true, value: vi.fn() });
