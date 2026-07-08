/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: {
    // cli の dist に同梱して配信する
    outDir: '../dist/studio-ui',
    emptyOutDir: true,
  },
  server: {
    proxy: { '/api': 'http://localhost:4400' },
  },
  test: {
    environment: 'jsdom',
  },
});
