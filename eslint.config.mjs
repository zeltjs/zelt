import strictTypes from '@9wick/eslint-plugin-strict-type-rules';
import eslintComments from '@eslint-community/eslint-plugin-eslint-comments/configs';
import zeltPlugin from '@zeltjs/eslint-plugin';
import importX from 'eslint-plugin-import-x';
import oxlint from 'eslint-plugin-oxlint';
import sonarjs from 'eslint-plugin-sonarjs';
import tseslint from 'typescript-eslint';

const TEST_FILES = ['**/*.test.{ts,tsx}', '**/*.e2e.test.{ts,tsx}'];
const FIXTURE_FILES = ['**/_fixtures/**/*.{ts,tsx}', '**/test/fixtures/**/*.{ts,tsx}'];
const EXAMPLE_FILES = ['examples/**/*.{ts,tsx}'];
const FORBIDDEN_TEST_PATTERNS = ['**/*.spec.{ts,tsx}', '**/*.e2e-spec.{ts,tsx}'];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules',
      '**/dist',
      '**/.nx',
      '**/*.d.ts',
      '**/tsdown.config.ts',
      '**/vitest.config.ts',
      '**/drizzle.config.ts',
      '**/zelt.config.ts',
      'knip.config.ts',
      '**/*.config.{mjs,js}',
      'eslint.config.mjs',
      '**/generated/**',
      'website/**',
      'vitest.shared.ts',
      'packages/eslint-plugin/**',
      'packages/unsafe-type-lib/**',
      'scripts/**',
      'integration/**',
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
    ignores: [...TEST_FILES, ...EXAMPLE_FILES, ...FIXTURE_FILES],
    rules: {
      'zelt/config-di-scope': 'error',
      'zelt/decorator-file-naming': ['error', { allowedNames: ['Env'] }],
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    ignores: [...TEST_FILES, ...EXAMPLE_FILES, ...FIXTURE_FILES],
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
      'import-x/order': 'off',
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
    },
  },
  {
    // Global: allow throw/try-catch everywhere (contract overrides below)
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@9wick/strict-type-rules/no-throw': 'off',
      '@9wick/strict-type-rules/no-try-catch': 'off',
    },
  },
  {
    // Forbid raw Error — use structured Zelt*Error classes instead
    files: ['packages/core/src/**/*.{ts,tsx}'],
    ignores: [...TEST_FILES, ...FIXTURE_FILES, '**/errors/**'],
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
    // decorator-metadata/inspect uses TypeScript Compiler API which requires
    // type assertions for internal type narrowing (e.g., StringLiteralType, TypeReference)
    files: ['packages/decorator-metadata/src/inspect/**/*.ts'],
    rules: {
      '@9wick/strict-type-rules/no-as-assertion': 'off',
      complexity: ['error', { max: 10 }],
    },
  },
  {
    // adaptClassContext handler types cls as object for store compatibility;
    // toConstructor narrows it to constructor type for afterApply callbacks.
    files: ['packages/decorator-metadata/src/runtime/decorators.ts'],
    rules: {
      '@9wick/strict-type-rules/no-as-assertion': 'off',
    },
  },
  {
    files: [...TEST_FILES, ...EXAMPLE_FILES, ...FIXTURE_FILES],
    rules: {
      'no-console': 'off',
      'max-lines': ['warn', { max: 1000, skipBlankLines: true, skipComments: true }],
      'import-x/no-namespace': 'off',
      '@9wick/strict-type-rules/nestjs-like-di-for-needle-di': 'off',
      '@9wick/strict-type-rules/no-as-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
  {
    // Leaf: prototype chain traversal, branded types, DI container boundary casts.
    files: ['packages/core/src/kernel/di/leaf.ts'],
    rules: {
      '@9wick/strict-type-rules/no-as-assertion': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
  {
    // inject: needle-di API boundary casts.
    files: ['packages/core/src/kernel/di/inject.ts'],
    rules: {
      '@9wick/strict-type-rules/no-as-assertion': 'off',
    },
  },
  {
    // Env module needs process.env access
    files: [
      // ProcessEnvSource reads process.env as Node.js environment adapter
      'packages/adapter-node/src/process-env.adaptor.ts',
      // EnvConfig implementations in adapters read process.env directly
      'packages/adapter-node/src/process-env.config.ts',
      'packages/adapter-electron/src/electron-env.config.ts',
      'packages/adapter-lambda/src/lambda-env.config.ts',
    ],
    rules: {
      '@9wick/strict-type-rules/no-process-access': 'off',
    },
  },
  {
    // NodeCliConfig provides process.argv/cwd access for CLI applications
    files: ['packages/adapter-node/src/node-cli.config.ts'],
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
      '@9wick/strict-type-rules/no-as-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      'max-lines-per-function': 'off',
    },
  },
  {
    // CLI entry points: type predicate needed for error type guard.
    files: [
      'packages/cli/src/errors.ts',
      'packages/cli/src/config/loader.ts',
      'packages/cli/src/builders/tsdown.ts',
      'packages/cli/src/commands/run.ts',
      'packages/cli/src/commands/dev.ts',
      'packages/cli/src/commands/build.ts',
    ],
    rules: {
      '@9wick/strict-type-rules/no-type-predicate': 'off',
    },
  },
  {
    // metadata.ts casts readonly unknown[] to domain types (MiddlewareInput[], MiddlewareIdentifier[])
    // that have no runtime tag for structural validation.
    files: ['packages/core/src/modules/http/routing/metadata.ts'],
    rules: {
      '@9wick/strict-type-rules/no-as-assertion': 'off',
    },
  },
  {
    // TC39 method decorator requires `any` for generic method type compatibility.
    // Type assertion is unavoidable at this decorator type boundary.
    files: ['packages/db/src/decorator.ts'],
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
    files: ['packages/db/src/middleware.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      'zelt/decorator-file-naming': 'off',
    },
  },
  {
    // Command module uses AsyncLocalStorage and generic type inference at runtime boundaries.
    // Type assertions are needed for inferred schema types.
    files: ['packages/core/src/modules/command/input/injection/args.ts'],
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
    files: ['packages/hono-client/src/plugin.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },
  {
    // openapi plugin uses dynamic import for user app files.
    // The imported module type is unknown at compile time.
    files: ['packages/openapi/src/plugin.ts'],
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
    // core/src/app layer cannot import from modules (layer violation)
    // Exception: default-modules.ts which is the bridge between app and modules
    files: ['packages/core/src/app/**/*.{ts,tsx}'],
    ignores: ['packages/core/src/app/default-modules.ts'],
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
          patterns: [
            {
              group: ['../modules/*', '../modules/**'],
              allowTypeImports: true,
              message:
                'app layer cannot import from modules layer (type imports are allowed). Use default-modules.ts as the bridge.',
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
