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

// jsdom does not implement media playback; stub so the video hero can mount.
Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: vi.fn().mockResolvedValue(undefined) });
Object.defineProperty(HTMLMediaElement.prototype, 'pause', { configurable: true, value: vi.fn() });
