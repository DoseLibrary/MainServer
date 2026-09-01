/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      // `ws: true` matters: the realtime channel (/api/v1/events) is a WebSocket
      // upgrade, which the shorthand string form of a proxy entry never forwards.
      '/api': { target: `http://127.0.0.1:${process.env.DOSE_DEV_API_PORT ?? '3000'}`, ws: true },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
  },
});
