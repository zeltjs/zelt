import swc from 'unplugin-swc';
export const sharedConfig = {
  plugins: [
    swc.vite({
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { decoratorVersion: '2022-03' },
      },
    }),
  ],
  esbuild: false,
  oxc: false,
};
