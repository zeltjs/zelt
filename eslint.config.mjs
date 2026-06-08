import strictTypes from '@9wick/eslint-plugin-strict-type-rules';
import eslintComments from '@eslint-community/eslint-plugin-eslint-comments/configs';
import zeltPlugin from '@zeltjs/eslint-plugin';
import importX from 'eslint-plugin-import-x';
import oxlint from 'eslint-plugin-oxlint';
import sonarjs from 'eslint-plugin-sonarjs';
import tseslint from 'typescript-eslint';

const TEST_FILES = ['**/*.test.{ts,tsx}', '**/*.e2e.test.{ts,tsx}'];
const TEST_FIXTURE_FILES = ['**/_fixtures/**/*.{ts,tsx}', '**/test/fixtures/**/*.{ts,tsx}'];
const EXAMPLE_FILES = ['examples/**/*.{ts,tsx}'];
const FORBIDDEN_TEST_PATTERNS = ['**/*.spec.{ts,tsx}', '**/*.e2e-spec.{ts,tsx}'];

const TOOL_CONFIG_FILES = [
  'eslint.config.mjs',
  'knip.config.ts',
  '**/tsdown.config.ts',
  '**/vitest.config.ts',
  '**/drizzle.config.ts',
  '**/zelt.config.ts',
  'vitest.shared.ts',
];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules',
      '**/dist',
      '**/.throw-trace',
      '**/.throw-trace/**',
      '**/.nx',
      '**/*.d.ts',
      '**/*.config.{mjs,js}',
      '**/generated/**',
      'website/**',
      'vitest.shared.ts',
      'packages/eslint-plugin/**',
      'packages/unsafe-type-lib/**',
      'scripts/**',
      'integration/**',
      ...TOOL_CONFIG_FILES,
    ],
  },
  tseslint.configs.recommended,
  ...oxlint.configs['flat/all'],
  eslintComments.recommended,
  {
    plugins: {
      'import-x': importX,
      sonarjs,
      zelt: zeltPlugin,
    },
  },
  ...strictTypes.configs.recommended,
  ...strictTypes.configs.test,
  ...strictTypes.configs.barrel,
  {
    files: ['**/*.*.{ts,tsx}'],
    ignores: [
      '**/*.lib.{ts,tsx}',
      '**/*.spec.{ts,tsx}',
      '**/*.test.{ts,tsx}',
      '**/*.type.{ts,tsx}',
      '**/*.types.{ts,tsx}',
      '**/*.errors.{ts,tsx}',
      '**/*.exceptions.{ts,tsx}',
      '**/*.decorator.{ts,tsx}',
      '**/*.feature.{ts,tsx}',
    ],
    rules: {
      '@9wick/strict-type-rules/nestjs-like-di-for-needle-di': [
        'error',
        {
          injectableDecorators: [
            'Injectable',
            'Controller',
            'Middleware',
            'ErrorHandler',
            'Config',
            'Command',
            'Scheduled',
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: { 'import-x/order': 'off' },
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
  },
  {
    files: ['packages/**/*.{ts,tsx}'],
    ignores: [...TEST_FILES, ...EXAMPLE_FILES, ...TEST_FIXTURE_FILES],
    rules: {
      'zelt/config-di-scope': 'error',
      'zelt/decorator-file-naming': ['error', { allowedNames: ['Env'] }],
      'zelt/double-dot-naming': [
        'error',
        {
          allowedFiles: ['main.ts', 'cli.ts','ipc-bridge.ts','ipc-fetch.ts','expose-ipc.ts'],
          allowedPatterns: ['on-*.ts'],
        },
      ],
    },
  },
  {
    // Files exposed as public API sub-paths in package.json exports.
    // Renaming would break consumers; keep the current names.
    files: [
      'packages/core/src/internal-bridge/testing.ts',
      'packages/core/src/internal-bridge/errors.ts',
      'packages/testing/src/adapters/vitest.ts',
      'packages/testing/src/adapters/jest.ts',
      'packages/testing/src/adapters/bun.ts',
      'packages/testing/src/adapters/node.ts',
    ],
    rules: {
      'zelt/double-dot-naming': 'off',
    },
  },
  {
    // TODO(bit:f955d0d8): transaction.middleware uses factory pattern to handle
    // generic DatabaseService<T>. Remove this exception once the design is reworked.
    files: ['packages/db/src/transaction.middleware.ts'],
    rules: {
      '@9wick/strict-type-rules/nestjs-like-di-for-needle-di': 'off',
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    ignores: [...TEST_FILES, ...EXAMPLE_FILES, ...TEST_FIXTURE_FILES],
    rules: {
      complexity: ['error', { max: 7 }],
      'sonarjs/cognitive-complexity': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      'max-lines': ['warn', { max: 500, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      // Global: allow throw/try-catch everywhere (contract overrides below)
      '@9wick/strict-type-rules/no-throw': 'off',
      '@9wick/strict-type-rules/no-try-catch': 'off',
    },
  },
  {
    files: [...TEST_FILES, ...EXAMPLE_FILES, ...TEST_FIXTURE_FILES],
    rules: {
      'no-console': 'off',
      'max-lines': ['warn', { max: 1000, skipBlankLines: true, skipComments: true }],
      'import-x/no-namespace': 'off',
      '@9wick/strict-type-rules/nestjs-like-di-for-needle-di': 'off',
      '@9wick/strict-type-rules/no-as-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },
  {
    // Forbid raw Error — use structured Zelt*Error classes instead
    files: ['packages/core/src/**/*.{ts,tsx}'],
    ignores: [...TEST_FILES, ...TEST_FIXTURE_FILES, '**/errors/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ThrowStatement > NewExpression[callee.name="Error"]',
          message: 'Use structured Zelt*Error classes instead of raw Error',
        },
      ],
    },
  },
  {
    // Forbid direct HTTPException — use defineHttpException in *.exceptions.ts instead
    files: ['packages/**/*.{ts,tsx}'],
    ignores: [
      ...TEST_FILES,
      ...TEST_FIXTURE_FILES,
      '**/errors/**',
      '**/define-http-exception.lib.ts',
      '**/*.exceptions.ts',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'NewExpression[callee.name="HTTPException"]',
          message: 'Use defineHttpException() in *.exceptions.ts instead of direct HTTPException',
        },
      ],
    },
  },
  {
    // decorator-metadata/inspect uses TypeScript Compiler API which requires
    // type assertions for internal type narrowing (e.g., StringLiteralType, TypeReference)
    files: ['packages/decorator-metadata/src/inspect/**/*.ts'],
    rules: {
      '@9wick/strict-type-rules/no-as-assertion': 'off',
      complexity: ['error', { max: 10 }],
    },
  },
  {
    // Env module needs process.env access
    files: [
      // EnvAdaptor implementations in adapters read process.env directly
      'packages/adapter-node/src/process-env.adaptor.ts',
      'packages/adapter-electron/src/main/electron-env.adaptor.ts',
      'packages/adapter-lambda/src/lambda-env.adaptor.ts',
    ],
    rules: {
      '@9wick/strict-type-rules/no-process-access': 'off',
    },
  },
  {
    // Preload script runs in CJS context and must use require() for electron.
    // process.contextIsolated is a preload-only API exposed by Electron.
    files: ['packages/adapter-electron/src/preload/expose-ipc.ts'],
    rules: {
      '@9wick/strict-type-rules/no-process-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },
  {
    // ipcFetch reads the IPC sender from globalThis (set by the preload script).
    // Reflect.get returns unknown; after a typeof guard the call returns any.
    files: ['packages/adapter-electron/src/renderer/ipc-fetch.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },
  {
    // Preload script runs in CJS context and must use require() for electron.
    // process.contextIsolated is a preload-only API exposed by Electron.
    files: ['packages/adapter-electron/src/preload/expose-ipc.ts'],
    rules: {
      '@9wick/strict-type-rules/no-process-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },
  {
    // Electron adapter bridges our string-based interface to Electron's overloaded
    // event/path APIs. Type assertions are unavoidable at this API boundary.
    files: [
      'packages/adapter-electron/src/main/electron-app.ts',
      'packages/adapter-electron/src/main/window-runtime.ts',
    ],
    rules: {
      '@9wick/strict-type-rules/no-as-assertion': 'off',
    },
  },
  {
    // ipcFetch reads the IPC sender from globalThis (set by the preload script).
    // Reflect.get returns unknown; after a typeof guard the call returns any.
    files: ['packages/adapter-electron/src/renderer/ipc-fetch.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },
  {
    // NodeCliConfig/BunCliConfig provides process.argv/cwd access for CLI applications
    files: [
      'packages/adapter-node/src/node-cli.config.ts',
      'packages/adapter-bun/src/bun-cli.config.ts',
    ],
    rules: {
      '@9wick/strict-type-rules/no-process-access': 'off',
    },
  },
  {
    // ConsoleTransport writes to stdout via console.log; this is its intended behavior.
    files: ['packages/core/src/built-in-service/logger/transport/console.transport.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: EXAMPLE_FILES,
    rules: {
      'max-lines-per-function': 'off',
    },
  },
  {
    // CLI entry points: type predicate needed for error type guard.
    files: [
      'packages/cli/src/cli.errors.ts',
      'packages/cli/src/config/config-loader.lib.ts',
      'packages/cli/src/tsdown.lib.ts',
      'packages/cli/src/run.command.ts',
      'packages/cli/src/dev.command.ts',
      'packages/cli/src/build.command.ts',
    ],
    rules: {
      '@9wick/strict-type-rules/no-type-predicate': 'off',
    },
  },
  {
    // citty-based CLI entry points: defineCommand exports plain command objects,
    // not Zelt @Command DI classes, so the needle-di module conventions don't apply.
    files: [
      'packages/cli/src/build.command.ts',
      'packages/cli/src/dev.command.ts',
      'packages/cli/src/run.command.ts',
    ],
    rules: {
      '@9wick/strict-type-rules/nestjs-like-di-for-needle-di': 'off',
    },
  },
  {
    // Decorator factory features export decorator functions (not DI-injectable classes).
    files: [
      'packages/core/src/features/command/definition/command.decorator.ts',
      'packages/core/src/features/scheduler/schedule/cron.decorator.ts',
      'packages/core/src/features/scheduler/schedule/daily.decorator.ts',
      'packages/core/src/features/scheduler/schedule/every.decorator.ts',
      'packages/core/src/features/scheduler/schedule/hourly.decorator.ts',
      'packages/core/src/features/scheduler/schedule/scheduled.decorator.ts',
      'packages/core/src/features/scheduler/schedule/weekly.decorator.ts',
    ],
    rules: {
      '@9wick/strict-type-rules/nestjs-like-di-for-needle-di': 'off',
    },
  },
  {
    // metadata.ts casts readonly unknown[] to domain types (MiddlewareInput[], MiddlewareIdentifier[])
    // that have no runtime tag for structural validation.
    files: ['packages/core/src/features/http/routing/routing-metadata.lib.ts'],
    rules: {
      '@9wick/strict-type-rules/no-as-assertion': 'off',
    },
  },
  {
    // TC39 method decorator requires `any` for generic method type compatibility.
    // Type assertion is unavoidable at this decorator type boundary.
    files: ['packages/db/src/db.decorator.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@9wick/strict-type-rules/no-as-assertion': 'off',
    },
  },
  {
    // createTransactionMiddleware defines a dynamic class inline via a factory function.
    // inject() returns `any` at the generic type boundary; the class name cannot match the file.
    files: ['packages/db/src/transaction.middleware.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      'zelt/decorator-file-naming': 'off',
    },
  },
  {
    // Command module uses AsyncLocalStorage and generic type inference at runtime boundaries.
    // Type assertions are needed for inferred schema types.
    files: ['packages/core/src/features/command/input/injection/args.lib.ts'],
    rules: {
      '@9wick/strict-type-rules/no-as-assertion': 'off',
    },
  },
  {
    // CLI generate command uses dynamic import for user app files.
    // The imported module type is unknown at compile time.
    // static schema is required for Command pattern but detected as class field.
    files: ['packages/hono-client/src/commands/generate.command.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },
  {
    // hono-client plugin uses dynamic import for user app files.
    // The imported module type is unknown at compile time.
    files: ['packages/hono-client/src/plugin.lib.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },
  {
    // openapi plugin uses dynamic import for user app files.
    // The imported module type is unknown at compile time.
    files: ['packages/openapi/src/openapi-plugin.lib.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },
  {
    // RateLimit decorator defines a dynamic middleware class inline.
    // The class name cannot match the file name pattern.
    files: ['packages/rate-limit/src/rate-limit.decorator.ts'],
    rules: {
      'zelt/decorator-file-naming': 'off',
    },
  },
  {
    files: FORBIDDEN_TEST_PATTERNS,
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Program',
          message: 'Use .test.ts instead of .spec.ts for test files',
        },
      ],
    },
  },
  {
    // core is runtime code — inspect module is for build-time tools only
    files: ['packages/core/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@zeltjs/decorator-metadata/inspect',
              message:
                'inspect is for build-time tools only. Use @zeltjs/decorator-metadata (runtime) in core.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/**/*.{ts,tsx}'],
    ignores: [
      'packages/core/**/*.{ts,tsx}',
      'packages/command/**/*.{ts,tsx}',
      'packages/cli/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@needle-di/core',
              message:
                'Import from @zeltjs/core or @zeltjs/testing instead. Direct @needle-di/core imports are only allowed in packages/core, packages/command, and packages/cli.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/**/*.{ts,tsx}'],
    ignores: ['packages/core/**/*.{ts,tsx}', 'packages/testing/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@zeltjs/core/internal-bridge/testing'],
              message:
                'internal-bridge/testing is reserved for @zeltjs/core and @zeltjs/testing. Use the public API from @zeltjs/core or @zeltjs/testing instead.',
            },
          ],
        },
      ],
    },
  },
);
