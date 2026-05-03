import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'examples/hello',
    include: ['src/**/*.e2e-spec.ts'],
  },
});
