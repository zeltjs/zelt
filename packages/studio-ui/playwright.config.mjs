import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.e2e.test.ts',
  fullyParallel: true,
  workers: 3,
  use: { baseURL: 'http://127.0.0.1:4491', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'tablet', use: { viewport: { width: 768, height: 1000 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: 'pnpm exec vite preview --host 127.0.0.1 --port 4491 --strictPort',
    url: 'http://127.0.0.1:4491',
    reuseExistingServer: false,
  },
});
