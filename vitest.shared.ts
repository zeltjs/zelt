import swcImport from 'unplugin-swc';

// Handle ESM/CJS interop differences across esbuild versions
const swc = (swcImport as unknown as { default: typeof swcImport }).default ?? swcImport;
export const sharedConfig = {
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
