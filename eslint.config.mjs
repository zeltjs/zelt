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
      'scripts/**',
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
      '**/*.adaptor.{ts,tsx}',
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
          allowClassFieldsInPaths: [
            '**/*.driver.ts',
            '**/*.adaptor.ts',
            '**/*.service.ts',
            '**/*.command.ts',
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
      'zelt/config-di-scope': 'warn',
      'zelt/decorator-file-naming': 'warn',
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
    // contract package uses neverthrow (ROP) — enforce no throw/try-catch
    files: ['packages/contract/src/**/*.{ts,tsx}'],
    ignores: [...TEST_FILES, ...FIXTURE_FILES],
    rules: {
      '@9wick/strict-type-rules/no-throw': 'error',
      '@9wick/strict-type-rules/no-try-catch': 'error',
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
    // compose* functions forward overloaded decorator types through unknown[],
    // which requires casting through unknown at this type-system boundary.
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
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
  {
    // build-time CLI tool: throw fatal errors that surface to the user via the CLI.
    // Type predicate needed for ContractError type guard.
    files: [
      'packages/contract/src/generate-client.ts',
      'packages/contract/src/watch.ts',
      'packages/contract/src/load-config.ts',
      'packages/contract/src/cli.ts',
    ],
    rules: {
      '@9wick/strict-type-rules/no-throw': 'off',
      '@9wick/strict-type-rules/no-try-catch': 'off',
      '@9wick/strict-type-rules/no-type-predicate': 'off',
    },
  },
  {
    // CLI tool entry points: watch loop must catch regeneration errors to keep watching
    // after a failure rather than crashing the process.
    // Type predicate and in operator needed for ContractError type guard.
    files: ['packages/contract/src/watch.ts', 'packages/contract/src/cli.ts'],
    rules: {
      '@9wick/strict-type-rules/no-type-predicate': 'off',
      '@9wick/strict-type-rules/no-in-operator': 'off',
    },
  },
  {
    // CLI output utility wraps console methods for centralized output control.
    files: ['packages/contract/src/cli-output.ts'],
    rules: {
      'no-console': 'off',
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
    // getContext bridges Hono's Context.get() (returns any) to typed KoyaContextSchema.
    // Type assertion is unavoidable at this external library boundary.
    files: ['packages/core/src/modules/http/request/injection/get-context.ts'],
    rules: {
      '@9wick/strict-type-rules/no-as-assertion': 'off',
    },
  },
  {
    // ContextKey uses phantom types and Symbol-based storage which requires type assertions
    // for type-safe internal context access pattern.
    files: [
      'packages/core/src/kernel/internal/context-key.ts',
      'packages/core/src/modules/http/middleware/auth/auth.ts',
    ],
    rules: {
      '@9wick/strict-type-rules/no-as-assertion': 'off',
    },
  },
  {
    // Config module uses prototype chain traversal and type assertions at DI boundaries.
    // These are necessary for the Token resolution pattern.
    files: ['packages/core/src/built-in-service/config/token.ts'],
    rules: {
      '@9wick/strict-type-rules/no-in-operator': 'off',
      '@9wick/strict-type-rules/no-as-assertion': 'off',
      '@9wick/strict-type-rules/no-import-rename': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
  {
    // Leaf mechanism: prototype chain traversal and type assertions for DI category resolution.
    files: ['packages/core/src/kernel/di/leaf.ts', 'packages/core/src/kernel/di/inject.ts'],
    rules: {
      '@9wick/strict-type-rules/no-as-assertion': 'off',
      '@9wick/strict-type-rules/no-import-rename': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
  {
    // Env module needs process.env access
    files: [
      'packages/core/src/built-in-service/env/env.service.ts',
      // ProcessEnvSource reads process.env as Node.js environment adapter
      'packages/adapter-node/src/process-env-source.ts',
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
    files: ['packages/adapter-node/src/cli.config.ts'],
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
    // Example apps: relaxed rules for demo code clarity
    // - raw fetch returns untyped JSON
    // - DI rules too strict for simple samples
    // - Workers KV returns untyped data
    files: ['examples/**/*.{ts,tsx}'],
    rules: {
      '@9wick/strict-type-rules/no-as-assertion': 'off',
      '@9wick/strict-type-rules/nestjs-like-di-for-needle-di': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      'max-lines-per-function': 'off',
    },
  },
  {
    // CLI command runner uses citty parseArgs which returns loosely typed object.
    // Type assertions are needed at this library boundary.
    files: [
      'packages/cli/src/commands/run/runner.ts',
      'packages/cli/src/commands/run/loader.ts',
      'packages/cli/src/commands/run.ts',
    ],
    rules: {
      '@9wick/strict-type-rules/no-as-assertion': 'off',
    },
  },
  {
    // CLI entry points: type predicate needed for error type guard.
    files: [
      'packages/cli/src/errors.ts',
      'packages/cli/src/config/loader.ts',
      'packages/cli/src/builders/tsdown.ts',
      'packages/cli/src/commands/run/runner.ts',
      'packages/cli/src/commands/run/loader.ts',
      'packages/cli/src/commands/run.ts',
      'packages/cli/src/commands/dev.ts',
      'packages/cli/src/commands/build.ts',
    ],
    rules: {
      '@9wick/strict-type-rules/no-type-predicate': 'off',
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
    files: ['packages/kv/src/adaptor-redis/redis-kv-store.ts'],
    rules: {
      '@9wick/strict-type-rules/no-as-assertion': 'off',
    },
  },
  {
    // EventBus uses generic event schema with keyof - type assertions needed at emit/subscribe boundary.
    files: [
      'packages/eventbus/src/adaptor-memory/memory-event-bus.adaptor.ts',
      'packages/eventbus/src/adaptor-redis/redis-event-bus.adaptor.ts',
    ],
    rules: {
      '@9wick/strict-type-rules/no-as-assertion': 'off',
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
    // Decorator-metadata bridge: turns decorator-metadata's TC39/legacy overloaded
    // result back into core's domain shapes (InjectableClass, MiddlewareInput[]).
    // The cross-boundary assertions are unavoidable here.
    files: [
      'packages/core/src/kernel/internal/decorator-helpers.ts',
      'packages/core/src/modules/http/middleware/use-middleware.ts',
      'packages/core/src/modules/http/routing/metadata.ts',
    ],
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
      '@9wick/strict-type-rules/nestjs-like-di-for-needle-di': 'off',
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
    // RedisService needs a private field to hold the Redis client instance.
    // This is necessary for stateful connection management.
    files: ['packages/redis/src/redis.service.ts'],
    rules: {
      '@9wick/strict-type-rules/nestjs-like-di-for-needle-di': 'off',
    },
  },
  {
    // Error factory uses generic K to index coreErrorDefinitions; TypeScript cannot narrow
    // the union type at the generic boundary, requiring type assertion.
    files: ['packages/core/src/kernel/errors/factory.ts'],
    rules: {
      '@9wick/strict-type-rules/no-as-assertion': 'off',
    },
  },
  {
    // override accesses container via Symbol which requires type assertion at runtime boundary.
    files: ['packages/core/src/app/override.ts'],
    rules: {
      '@9wick/strict-type-rules/no-as-assertion': 'off',
    },
  },
  {
    // defineError/defineHttpException return anonymous classes that cannot satisfy
    // their return types without type assertion. isKVError uses instanceof union check.
    files: [
      'packages/core/src/kernel/errors/define-error.ts',
      'packages/core/src/kernel/errors/define-http-exception.ts',
      'packages/kv/src/errors.ts',
    ],
    rules: {
      '@9wick/strict-type-rules/no-as-assertion': 'off',
      '@9wick/strict-type-rules/no-type-predicate': 'off',
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
    // @Config classes may have class fields for configuration values
    files: ['packages/**/*.config.ts'],
    rules: {
      '@9wick/strict-type-rules/nestjs-like-di-for-needle-di': 'off',
    },
  },
  {
    // CloudflareWorkersEnvConfig needs type assertion for cloudflare:workers env object.
    files: ['packages/adapter-cloudflare-workers/src/cloudflare-workers-env.config.ts'],
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
