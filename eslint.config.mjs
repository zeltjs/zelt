import strictTypes from '@9wick/eslint-plugin-strict-type-rules';
import eslintComments from '@eslint-community/eslint-plugin-eslint-comments/configs';
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
      '**/*.config.{ts,mjs,js}',
      'eslint.config.mjs',
      '**/generated/**',
      'website/**',
    ],
  },
  tseslint.configs.recommended,
  ...oxlint.configs['flat/all'],
  eslintComments.recommended,
  {
    plugins: { 'import-x': importX, sonarjs },
  },
  ...strictTypes.configs.recommended,
  ...strictTypes.configs.test,
  ...strictTypes.configs.barrel,
  {
    files: ['**/*.*.{ts,tsx}'],
    ignores: ['**/*.lib.{ts,tsx}', '**/*.types.{ts,tsx}', '**/*.decorator.{ts,tsx}'],
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
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
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
      'import-x/no-cycle': 'error',
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
        },
      ],
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
    files: [...TEST_FILES, ...EXAMPLE_FILES, ...FIXTURE_FILES],
    rules: {
      'no-console': 'off',
      'max-lines': ['warn', { max: 1000, skipBlankLines: true, skipComments: true }],
      'import-x/no-namespace': 'off',
      '@9wick/strict-type-rules/nestjs-like-di-for-needle-di': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
  {
    // framework error strategy: throw + global error handler (spec §4.9 / koya phase2)
    files: ['packages/core/src/**/*.{ts,tsx}'],
    rules: {
      '@9wick/strict-type-rules/no-throw': 'off',
      '@9wick/strict-type-rules/no-try-catch': 'off',
    },
  },
  {
    // build-time CLI tool: throw fatal errors that surface to the user via the CLI
    files: [
      'packages/contract/src/analyzer/**/*.{ts,tsx}',
      'packages/contract/src/emit/**/*.{ts,tsx}',
      'packages/contract/src/generate-client.ts',
      'packages/contract/src/watch.ts',
      'packages/contract/src/load-config.ts',
      'packages/contract/src/cli.ts',
    ],
    rules: {
      '@9wick/strict-type-rules/no-throw': 'off',
    },
  },
  {
    // CLI tool entry points: console output is the user-visible UX, watch loop must catch
    // regeneration errors to keep watching after a failure rather than crashing the process.
    files: ['packages/contract/src/watch.ts', 'packages/contract/src/cli.ts'],
    rules: {
      'no-console': 'off',
      '@9wick/strict-type-rules/no-try-catch': 'off',
    },
  },
  {
    // CLI and config loader need process.argv / process.cwd() — these are build-time tools
    // that run in Node.js directly, not inside an application container.
    files: ['packages/contract/src/cli.ts', 'packages/contract/src/load-config.ts'],
    rules: {
      '@9wick/strict-type-rules/no-process-access': 'off',
    },
  },
  {
    // error-handler reads NODE_ENV to decide whether to expose internal error messages.
    // process.env.NODE_ENV is the de-facto standard for this guard; edge/serverless runtimes
    // inline or polyfill it at build time. typeof process guard prevents crashes where process
    // is absent (e.g. pure browser bundles).
    files: ['packages/core/src/http/error-handler.ts'],
    rules: {
      '@9wick/strict-type-rules/no-process-access': 'off',
    },
  },
  {
    // getContext bridges Hono's Context.get() (returns any) to typed KoyaContextSchema.
    // Type assertion is unavoidable at this external library boundary.
    files: ['packages/core/src/primitives/get-context.ts'],
    rules: {
      '@9wick/strict-type-rules/no-as-assertion': 'off',
    },
  },
  {
    // Config module uses prototype chain traversal and type assertions at DI boundaries.
    // These are necessary for the Token resolution pattern.
    files: ['packages/core/src/config/token.ts'],
    rules: {
      '@9wick/strict-type-rules/no-in-operator': 'off',
      '@9wick/strict-type-rules/no-as-assertion': 'off',
    },
  },
  {
    // Env module needs process.env access
    files: ['packages/core/src/modules/env/env.service.ts'],
    rules: {
      '@9wick/strict-type-rules/no-process-access': 'off',
    },
  },
  {
    // TTY detection reads process.stdout.isTTY and process.env.NO_COLOR; typeof guard
    // prevents crashes in runtimes without process (e.g. browser/Cloudflare Workers).
    files: ['packages/core/src/modules/logger/formatter/pretty.formatter.lib.ts'],
    rules: {
      '@9wick/strict-type-rules/no-process-access': 'off',
    },
  },
  {
    // Example apps: relaxed rules for demo code clarity
    // - HTTPException requires throw
    // - raw fetch returns untyped JSON
    // - DI rules too strict for simple samples
    // - Workers KV returns untyped data
    files: ['examples/**/*.{ts,tsx}'],
    rules: {
      '@9wick/strict-type-rules/no-throw': 'off',
      '@9wick/strict-type-rules/no-as-assertion': 'off',
      '@9wick/strict-type-rules/nestjs-like-di-for-needle-di': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      'max-lines-per-function': 'off',
    },
  },
  {
    // CLI command runner uses Object.create and DI container.get() at dynamic module
    // boundaries where type assertions are unavoidable.
    files: [
      'packages/cli/src/commands/run/runner.ts',
      'packages/cli/src/commands/run/loader.ts',
      'packages/cli/src/commands/run.ts',
    ],
    rules: {
      '@9wick/strict-type-rules/no-as-assertion': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },
  {
    files: ['**/*.decorator.ts'],
    rules: {
      '@9wick/strict-type-rules/nestjs-like-di-for-needle-di': 'off',
    },
  },
  {
    files: ['**/*.types.ts'],
    rules: {
      '@9wick/strict-type-rules/nestjs-like-di-for-needle-di': 'off',
    },
  },
  {
    // JSON.parse returns `any`; type assertion unavoidable at this generic boundary.
    files: ['packages/kv/src/serialize.ts'],
    rules: {
      '@9wick/strict-type-rules/no-as-assertion': 'off',
    },
  },
  {
    // eval() returns unknown; type assertion needed at Lua script boundary.
    files: ['packages/kv-driver-redis/src/zelt-redis.ts'],
    rules: {
      '@9wick/strict-type-rules/no-as-assertion': 'off',
    },
  },
  {
    // Session context uses generic type narrowing at AsyncLocalStorage boundary.
    // Type assertions are needed for user-facing generic session data APIs.
    files: [
      'packages/auth-session/src/session.context.lib.ts',
      'packages/auth-session/src/session.functions.lib.ts',
    ],
    rules: {
      '@9wick/strict-type-rules/no-as-assertion': 'off',
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
);
