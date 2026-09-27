import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'studio-spatial',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
