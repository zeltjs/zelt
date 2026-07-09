import strictTypes from '@9wick/eslint-plugin-strict-type-rules';
import eslintComments from '@eslint-community/eslint-plugin-eslint-comments/configs';
import zeltPlugin from '@zeltjs/eslint-plugin';
import importX from 'eslint-plugin-import-x';
import oxlint from 'eslint-plugin-oxlint';
import sonarjs from 'eslint-plugin-sonarjs';
import tseslint from 'typescript-eslint';

// ─────────────────────────────────────────────────────────────────────────────
// File classification — which files belong to which category.
// Rule blocks below only reference these categories (or explicit file lists in
// the exemption section); they never define new file kinds inline.
// ─────────────────────────────────────────────────────────────────────────────

const TEST_FILES = ['**/*.test.{ts,tsx}', '**/*.e2e.test.{ts,tsx}'];
const TEST_FIXTURE_FILES = [
  '**/_fixtures/**/*.{ts,tsx}',
  '**/test/fixtures/**/*.{ts,tsx}',
  '**/test-fixtures/**/*.{ts,tsx}',
];
const EXAMPLE_FILES = ['examples/**/*.{ts,tsx}'];
// Tests, their fixtures, and runnable examples share the same relaxed policy.
const TEST_LIKE_FILES = [...TEST_FILES, ...EXAMPLE_FILES, ...TEST_FIXTURE_FILES];

// Tool configuration files are not shipped code and are excluded from linting.
const TOOL_CONFIG_FILES = [
  'eslint.config.mjs',
  'knip.config.ts',
  '**/tsdown.config.ts',
  '**/vitest.config.ts',
  '**/vite.config.ts',
  '**/drizzle.config.ts',
  '**/zelt.config.ts',
  'vitest.shared.ts',
];

// Shared no-restricted-imports entries. The rule's options replace wholesale
// when a later block matches the same file, so each boundary/restricted-imports-*
// block below must declare its COMPLETE ban list from these fragments.
const BAN_NEEDLE_DI = {
  name: '@needle-di/core',
  message:
    'Import from @zeltjs/core or @zeltjs/testing instead. Direct @needle-di/core imports are only allowed in packages/core, packages/command, and packages/cli.',
};
const BAN_INTERNAL_BRIDGE_TESTING = {
  group: ['@zeltjs/core/internal-bridge/testing'],
  message:
    'internal-bridge/testing is reserved for @zeltjs/core and @zeltjs/testing. Use the public API from @zeltjs/core or @zeltjs/testing instead.',
};

export default tseslint.config(
  // ═══════════════════════════════════════════════════════════════════════════
  // Ignores
  // ═══════════════════════════════════════════════════════════════════════════
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

  // ═══════════════════════════════════════════════════════════════════════════
  // Presets
  // ═══════════════════════════════════════════════════════════════════════════
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

  // ═══════════════════════════════════════════════════════════════════════════
  // Policy per file category
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: 'zelt/all-files',
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      'import-x/order': 'off',
      // Allow throw/try-catch project-wide (strictTypes recommended forbids them)
      '@9wick/strict-type-rules/no-throw': 'off',
      '@9wick/strict-type-rules/no-try-catch': 'off',
    },
  },
  {
    name: 'zelt/source-files',
    files: ['**/*.{ts,tsx}'],
    ignores: TEST_LIKE_FILES,
    rules: {
      // strictTypes recommended sets max-lines to 'error'; downgrade to 'warn' for source files
      'max-lines': ['warn', { max: 500, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    name: 'zelt/di-convention',
    // Double-dot named files are DI modules; role suffixes exempted here are
    // non-DI file kinds (types, errors, decorators, ...).
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
    name: 'zelt/packages-source',
    files: ['packages/**/*.{ts,tsx}'],
    ignores: TEST_LIKE_FILES,
    rules: {
      'zelt/config-di-scope': 'error',
      'zelt/decorator-file-naming': ['error', { allowedNames: ['Env'] }],
      // 段階的廃止に向けた棚卸し用。オーバーロードによる無検証キャスト
      // (narrowTo パターン) は as と同等に unsafe なので新規追加を抑止する
      'zelt/no-overload-cast': 'warn',
      'zelt/double-dot-naming': [
        'error',
        {
          allowedFiles: [
            'main.ts',
            'cli.ts',
            'codegen.ts',
            'ipc-bridge.ts',
            'ipc-fetch.ts',
            'expose-ipc.ts',
            // tsx child-process entry point and its wire protocol; the exact
            // basenames are a contract with the parent process spawn path
            'analyzer-entry.ts',
            'analyzer-protocol.ts',
            // Vite SPA conventions (studio-ui): the rule strips only a
            // trailing ".ts", so single-dot ".tsx" entry points never satisfy
            // the double-dot check no matter how they're named
            'main.tsx',
            'app.tsx',
          ],
          allowedPatterns: ['on-*.ts'],
        },
      ],
    },
  },
  {
    name: 'zelt/test-like',
    files: TEST_LIKE_FILES,
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
    name: 'zelt/examples',
    files: EXAMPLE_FILES,
    rules: {
      'max-lines-per-function': 'off',
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Architectural boundaries
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: 'boundary/no-generic-error',
    // Forbid raw Error construction in runtime packages. Use named domain
    // errors such as ZeltInternalError or CaptureStackError instead.
    files: [
      'packages/core/src/**/*.{ts,tsx}',
      'packages/decorator-metadata/src/runtime/**/*.{ts,tsx}',
    ],
    ignores: [...TEST_FILES, ...TEST_FIXTURE_FILES, '**/errors/**'],
    rules: {
      'zelt/no-generic-error-constructor': 'error',
    },
  },
  {
    name: 'boundary/http-exception',
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
    name: 'boundary/test-naming',
    // strictTypes.configs.test also forbids *.spec.ts, but boundary/http-exception
    // above overwrites no-restricted-syntax for packages/**, which would silently
    // drop that ban. This block must stay after it and re-assert both patterns.
    files: ['**/*.spec.{ts,tsx}', '**/*.e2e-spec.{ts,tsx}'],
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
    name: 'boundary/inspect-is-build-time',
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
    name: 'boundary/restricted-imports',
    // Default for packages: both bans. Packages exempt from one ban are
    // ignored here and get their complete list in the blocks below.
    files: ['packages/**/*.{ts,tsx}'],
    ignores: [
      // core may use both (it owns needle-di and internal-bridge)
      'packages/core/**/*.{ts,tsx}',
      // command/cli may use @needle-di/core
      'packages/command/**/*.{ts,tsx}',
      'packages/cli/**/*.{ts,tsx}',
      // testing may use internal-bridge/testing
      'packages/testing/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: [BAN_NEEDLE_DI], patterns: [BAN_INTERNAL_BRIDGE_TESTING] },
      ],
    },
  },
  {
    name: 'boundary/restricted-imports-di-packages',
    files: ['packages/command/**/*.{ts,tsx}', 'packages/cli/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [BAN_INTERNAL_BRIDGE_TESTING] }],
    },
  },
  {
    name: 'boundary/restricted-imports-testing',
    files: ['packages/testing/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { paths: [BAN_NEEDLE_DI] }],
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Allowed by nature — permanent allowances. A rule is lifted here only when
  // the property the rule protects is guaranteed by what the file IS, so no
  // violation is possible. Anything that doesn't meet that bar is debt below.
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: 'allow/process-boundary',
    // no-process-access protects two properties: "runs where process does not
    // exist" and "process access is centralized behind EnvAdaptor/CliConfig".
    // These files ARE the process boundary implementations in Node-guaranteed
    // runtimes; every other file must go through them via DI.
    files: [
      // EnvAdaptor implementations
      'packages/adapter-node/src/process-env.adaptor.ts',
      'packages/adapter-electron/src/main/electron-env.adaptor.ts',
      'packages/adapter-lambda/src/lambda-env.adaptor.ts',
      // CliConfig implementations (process.argv/cwd)
      'packages/adapter-node/src/node-cli.config.ts',
      'packages/adapter-bun/src/bun-cli.config.ts',
      // CLI runtime bootstrap reads process.env before DI is available
      'packages/cli/src/cli-runtime.lib.ts',
      // Electron preload: process.contextIsolated is a preload-only Electron API
      'packages/adapter-electron/src/preload/expose-ipc.ts',
      // Disposable tsx child process: no DI container exists in this throwaway
      // script, so it IS the process boundary (argv/cwd/stdout/exitCode)
      'packages/cli/src/studio/analyzer-entry.ts',
      // Spawns the analyzer child process with the parent's own node binary
      // (process.execPath) so it runs regardless of the host's PATH/shell setup
      'packages/cli/src/studio/analyzer-runner.lib.ts',
    ],
    rules: {
      '@9wick/strict-type-rules/no-process-access': 'off',
    },
  },
  {
    name: 'allow/console-transport',
    // no-console protects "log through the logger". ConsoleTransport IS the
    // logger's stdout sink; writing to console is its role.
    files: ['packages/core/src/built-in-service/logger/transport/console.transport.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    name: 'allow/studio-ui-browser-boundary',
    // no-console protects "log through the logger", but studio-ui is a plain
    // browser SPA with no zelt DI container and therefore no injected logger
    // to route through. This file IS the client-side localStorage boundary.
    files: ['packages/cli/studio-ui/src/positions.lib.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    name: 'allow/public-entrypoints',
    // double-dot-naming protects internal module-role naming. These files ARE
    // the public API sub-paths declared in package.json exports; their names
    // are consumer-facing contract, not internal role names.
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

  // ═══════════════════════════════════════════════════════════════════════════
  // Debt — rule violations the implementation must be fixed to remove.
  // New entries are allowed only when they state a concrete repay condition
  // (see each block's "Repay:" note). Once repaid, delete the entry to
  // shrink this list.
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: 'debt/unvalidated-cast',
    // Repay: stop trusting external data shapes. Validate with a schema, or
    // move the truly unavoidable cast into @zeltjs/unsafe-type-lib as a named,
    // audited helper. Normal packages must end up assertion-free.
    files: [
      // TypeScript Compiler API internal type narrowing (StringLiteralType, TypeReference)
      'packages/decorator-metadata/src/inspect/**/*.ts',
      // casts readonly unknown[] to domain types with no runtime tag
      'packages/core/src/features/http/routing/routing-metadata.lib.ts',
      // AsyncLocalStorage + generic schema inference at runtime boundaries
      'packages/core/src/features/command/input/injection/args.lib.ts',
    ],
    rules: {
      '@9wick/strict-type-rules/no-as-assertion': 'off',
    },
  },
  {
    name: 'debt/unvalidated-dynamic-import',
    // Repay: parse the dynamically imported user-app module with a schema
    // instead of assigning the untyped result.
    files: [
      'packages/hono-client/src/commands/generate.command.ts',
      'packages/hono-client/src/plugin.lib.ts',
      'packages/openapi/src/openapi-plugin.lib.ts',
    ],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },
  {
    name: 'debt/electron-preload-require',
    // Preload runs in CJS context and require()s electron untyped.
    // Repay: validate the required module shape instead of trusting it.
    files: ['packages/adapter-electron/src/preload/expose-ipc.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },
  {
    name: 'debt/electron-renderer-ipc-sender',
    // ipcFetch reads the preload-injected IPC sender from globalThis;
    // Reflect.get returns unknown and the guarded call returns any.
    // Repay: validate the injected sender instead of trusting it.
    files: ['packages/adapter-electron/src/renderer/ipc-fetch.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },
  {
    name: 'debt/cli-error-type-guards',
    // Repay: replace type-predicate error guards with discriminated unions or
    // instanceof checks on named error classes.
    files: [
      'packages/cli/src/cli.errors.ts',
      'packages/cli/src/config/config-loader.lib.ts',
      'packages/cli/src/tsdown.lib.ts',
      'packages/cli/src/run.command.ts',
      'packages/cli/src/dev.command.ts',
      'packages/cli/src/build.command.ts',
      'packages/cli/src/graphql.command.ts',
    ],
    rules: {
      '@9wick/strict-type-rules/no-type-predicate': 'off',
    },
  },
  {
    name: 'debt/studio-app-shape-guard',
    // analyzer-entry runs in a disposable child process and must narrow the
    // user's `app` object (loaded from their zelt.config.ts) without importing
    // core's runtime types (see design doc). FeatureLike.featureClasses is a
    // function, which schema libraries (Valibot) cannot validate meaningfully,
    // so a hand-written predicate is the least-bad option here.
    // Repay: once core exposes a schema-validated app shape, use that instead.
    files: ['packages/cli/src/studio/analyzer.lib.ts'],
    rules: {
      '@9wick/strict-type-rules/no-type-predicate': 'off',
    },
  },
  {
    name: 'debt/studio-graph-json-cast',
    // Untrusted JSON from the analyzer child process must become a typed
    // DependencyGraph at this boundary. A mirrored valibot schema would
    // duplicate graph.types.ts as a second source of truth for the shape;
    // a narrow cast after a manual field check is the least-bad option here.
    // Repay: once DependencyGraph is defined via a valibot schema (single
    // source of truth), replace this cast with schema-derived validation.
    files: ['packages/cli/src/studio/analyzer-runner.lib.ts'],
    rules: {
      '@9wick/strict-type-rules/no-as-assertion': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
    },
  },
  {
    name: 'debt/studio-ui-untrusted-json',
    // Same boundary as debt/studio-graph-json-cast, one hop further down the
    // pipe: the browser SPA receives the same untrusted JSON over HTTP
    // (/api/graph, /api/reload) and from its own localStorage. A mirrored
    // valibot schema would duplicate graph.types.ts as a second source of
    // truth for the shape; a narrow cast is the least-bad option here.
    // Repay: once DependencyGraph is defined via a valibot schema (single
    // source of truth), replace these casts with schema-derived validation.
    files: ['packages/cli/studio-ui/src/app.tsx', 'packages/cli/studio-ui/src/positions.lib.ts'],
    rules: {
      '@9wick/strict-type-rules/no-as-assertion': 'off',
    },
  },
  {
    name: 'debt/citty-command-naming',
    // These are citty defineCommand entry points, not Zelt @Command DI classes,
    // yet they claim the .command.ts role suffix.
    // Repay: rename to reflect what they are; the exception then disappears.
    files: [
      'packages/cli/src/build.command.ts',
      'packages/cli/src/dev.command.ts',
      'packages/cli/src/run.command.ts',
      'packages/cli/src/graphql.command.ts',
      'packages/cli/src/studio.command.ts',
    ],
    rules: {
      '@9wick/strict-type-rules/nestjs-like-di-for-needle-di': 'off',
    },
  },
  {
    name: 'debt/inspect-complexity',
    // Repay: decompose Compiler API traversal functions until max 7 holds.
    files: ['packages/decorator-metadata/src/inspect/**/*.ts'],
    rules: {
      complexity: ['error', { max: 10 }],
    },
  },
  {
    name: 'debt/db-decorator',
    // TC39 method decorator wrapping loses generic method types.
    // Repay: rework the decorator's type boundary so `any` and assertions are
    // not needed (or route the cast through @zeltjs/unsafe-type-lib).
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
    name: 'debt/transaction-middleware',
    // createTransactionMiddleware defines a dynamic class inline via a factory
    // to handle generic DatabaseService<T>; inject() returns `any` at the
    // generic boundary and the class name cannot match the file.
    // Repay: rework the design (tracked as bit:f955d0d8).
    files: ['packages/db/src/transaction.middleware.ts'],
    rules: {
      '@9wick/strict-type-rules/nestjs-like-di-for-needle-di': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      'zelt/decorator-file-naming': 'off',
    },
  },
  {
    name: 'core/internal-injectables',
    // core 内部のフレームワーククラス (AppBootstrap / ConfigRegistry / LifecycleManager /
    // AbstractLeafImplementation)。@Injectable が zelt デコレータとしてメタデータを記録する
    // ようになったことで命名検査の対象に入ったが、これらは .lib レイヤ規約と公開 API 名の
    // 維持を decorator-file-naming より優先する。
    files: [
      'packages/core/src/app/app-bootstrap.lib.ts',
      'packages/core/src/app/config-registry.lib.ts',
      'packages/core/src/kernel/lifecycle.lib.ts',
      'packages/core/src/kernel/di/leaf.lib.ts',
    ],
    rules: {
      'zelt/decorator-file-naming': 'off',
    },
  },
);
