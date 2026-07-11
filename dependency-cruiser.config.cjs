const coreSrc = '^packages/core/src/';
const coreLayer = (name) => `${coreSrc}${name}/`;
const coreLayerDeep = (name) => `${coreLayer(name)}(?!index\\.ts$).+`;
const coreKernelDeepExceptErrorIndex = `${coreLayer('kernel')}(?!index\\.ts$|errors/index\\.ts$).+`;

module.exports = {
  forbidden: [
    {
      name: 'core-kernel-is-base-layer',
      severity: 'error',
      from: { path: coreLayer('kernel') },
      to: {
        path: [
          coreLayer('built-in-service'),
          coreLayer('app'),
          coreLayer('features'),
          coreLayer('internal-bridge'),
        ],
      },
    },
    {
      name: 'core-built-in-service-imports-lower-index-only',
      severity: 'error',
      from: { path: coreLayer('built-in-service') },
      to: {
        path: [
          coreLayerDeep('kernel'),
          coreLayer('app'),
          coreLayer('features'),
          coreLayer('internal-bridge'),
        ],
      },
    },
    {
      name: 'core-app-imports-lower-index-only',
      severity: 'error',
      from: { path: coreLayer('app') },
      to: {
        path: [
          coreLayerDeep('kernel'),
          coreLayerDeep('built-in-service'),
          coreLayer('features'),
          coreLayer('internal-bridge'),
        ],
      },
    },
    {
      name: 'core-features-import-lower-index-only',
      severity: 'error',
      from: { path: coreLayer('features') },
      to: {
        path: [
          coreLayerDeep('kernel'),
          coreLayerDeep('built-in-service'),
          coreLayerDeep('app'),
          coreLayer('internal-bridge'),
        ],
      },
    },
    {
      name: 'core-internal-bridge-imports-core-public-indexes-only',
      severity: 'error',
      from: { path: coreLayer('internal-bridge') },
      to: {
        path: [
          coreKernelDeepExceptErrorIndex,
          coreLayerDeep('built-in-service'),
          coreLayerDeep('app'),
          coreLayer('features'),
        ],
      },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    exclude: {
      path: '\\.test\\.ts$',
    },
    tsConfig: {
      fileName: 'tsconfig.json',
    },
    tsPreCompilationDeps: true,
  },
};
