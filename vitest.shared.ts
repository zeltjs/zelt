import { fileURLToPath } from 'node:url';
import swc from 'unplugin-swc';
export const sharedConfig = {
  test: { setupFiles: [fileURLToPath(new URL('./scripts/vitest.setup.ts', import.meta.url))] },
  plugins: [
    swc.vite({
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { decoratorVersion: '2022-03' },
      },
    }),
  ],
  esbuild: false as const,
  oxc: false as const,
};
