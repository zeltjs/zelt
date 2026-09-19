import type {
  CallContext,
  CallSiteTarget,
  ClassDeclarationInfo,
  ClassSource,
  DecoratorInfo,
  FunctionDeclarationInfo,
  FunctionRef,
  InspectError,
  ProgramCacheError,
} from '@zeltjs/decorator-metadata/inspect';
import type { ResultAsync } from 'neverthrow';
import { okAsync } from 'neverthrow';
import { describe, expect, it } from 'vitest';
import type {
  BuildGraphError,
  BuildGraphV3Deps,
  DependencyResolution,
  GraphRootV3,
} from './build-graph.lib';
import {
  buildDependencyGraph,
  classNodeId,
  externalNodeId,
  fieldsOf,
  fileKindOf,
  fnNodeId,
  isClassNode,
  isExternalNode,
  isFnNode,
  moduleOf,
} from './build-graph.lib';
import type { DependencyGraph, GraphNodeV3 } from './graph.types';

// buildDependencyGraph は ResultAsync<DependencyGraph, BuildGraphError | InspectError |
// ProgramCacheError> を返す(レビュー指摘8、レビュー再指摘: エラー体系の統一)。
// 成功を期待するテストの大半で使う共通ヘルパー。失敗を期待するテストは個別に
// `result.isErr()` を確認する(このヘルパーは使わない)
const graphOk = async (
  result: ResultAsync<DependencyGraph, BuildGraphError | InspectError | ProgramCacheError>,
): Promise<DependencyGraph> => {
  const r = await result;
  if (!r.isOk()) throw new Error(`expected ok but got error: ${JSON.stringify(r.error)}`);
  return r.value;
};

describe('moduleOf', () => {
  it('returns the posix parent directory of a file path', () => {
    expect(moduleOf('src/entry/controllers/auth.controller.ts')).toBe('src/entry/controllers');
    expect(moduleOf('src/app.ts')).toBe('src');
  });
});

describe('fileKindOf', () => {
  it('returns the second-to-last dot-separated segment when there are 3+ segments', () => {
    expect(fileKindOf('ec-jwt.config.ts')).toBe('config');
    expect(fileKindOf('auth.controller.ts')).toBe('controller');
    expect(fileKindOf('current-user.lib.ts')).toBe('lib');
    expect(fileKindOf('order.handlers.ts')).toBe('handlers');
  });

  it('returns null when there are fewer than 3 segments', () => {
    expect(fileKindOf('app.ts')).toBeNull();
  });
});

describe('id builders', () => {
  it('builds a ClassNode id from filePath and name', () => {
    expect(classNodeId('src/a.ts', 'AController')).toBe('src/a.ts#AController');
  });

  it('builds a FnNode id with owner when present', () => {
    expect(fnNodeId('src/a.ts', 'AController', 'greet')).toBe('src/a.ts#AController.greet');
  });

  it('builds a FnNode id without owner for module-scope functions', () => {
    expect(fnNodeId('src/a.lib.ts', undefined, 'requireUser')).toBe('src/a.lib.ts#requireUser');
  });

  it('builds an ExternalNode id from package and member', () => {
    expect(externalNodeId('@zeltjs/core', 'LoggerService')).toBe('ext:@zeltjs/core#LoggerService');
  });
});

type FakeFile = {
  readonly filePath: string;
  // クラスを持つファイルのみ設定する(モジュール関数のみのファイルは省略可)。
  // v3 では ClassNode.decorators/loc は getClassDeclarations 経由でのみ得られる(設計判断メモ10)。
  // decorators は DecoratorInfo(name/line/args)形式。args は @UseMiddleware(X) の
  // X のような識別子引数の名前一致に使う(team-lead 決定)
  readonly classDecl?: {
    readonly name: string;
    // レビュー指摘6: default export('default')・`export { A as B }`(B)のような、
    // 宣言名と異なる公開名を模すためのフィールド。省略時は named export 相当(exportName 無し)
    readonly exportName?: string;
    readonly decorators?: readonly DecoratorInfo[];
    readonly loc?: { readonly start: number; readonly end: number };
  };
  readonly functions: readonly {
    readonly name: string;
    readonly owner?: string;
    readonly decorators?: readonly DecoratorInfo[];
    readonly visibility?: 'public' | 'private';
    readonly contract?: {
      readonly params: readonly { name: string; type: string }[];
      returnType: string;
    };
    readonly calls?: readonly {
      readonly line: number;
      // レビュー指摘12: 同一行に複数の呼び出しがある辺重複排除のテスト用。省略時は 1
      readonly column?: number;
      readonly awaited?: boolean;
      readonly context?: CallContext;
      readonly target: CallSiteTarget;
      readonly firstArgLiteral?: string;
    }[];
  }[];
};

const src = (filePath: string, exportName: string): ClassSource => ({ filePath, exportName });

// レビュー再指摘(エラー体系の統一): BuildGraphV3Deps の各関数は ResultAsync<T, InspectError |
// ProgramCacheError> を返す契約になった。フェイクは常に成功させたいだけなので okAsync で包む
// (async 関数にはしない。async 関数が返すのは Promise<ResultAsync<...>> になってしまい
// 型が合わない)
const buildFakeDeps = (
  files: readonly FakeFile[],
  depsMap: ReadonlyMap<string, readonly DependencyResolution[]>,
): BuildGraphV3Deps => {
  const byFile = new Map(files.map((f) => [f.filePath, f]));
  return {
    resolveDependencies: (source) => {
      const deps = depsMap.get(`${source.filePath}#${source.exportName}`);
      return okAsync(deps === undefined ? { kind: 'external' } : { kind: 'resolved', deps });
    },
    getFunctionDeclarations: (filePath) => {
      const file = byFile.get(filePath);
      if (!file) return okAsync([]);
      return okAsync(
        file.functions.map((fn) => ({
          ref:
            fn.owner === undefined
              ? { kind: 'function', filePath, name: fn.name }
              : { kind: 'method', filePath, owner: fn.owner, name: fn.name },
          decorators: fn.decorators ?? [],
          visibility: fn.visibility ?? 'public',
          loc: { start: 1, end: 2 },
        })),
      );
    },
    getFunctionSignature: (ref) => {
      const file = byFile.get(ref.filePath);
      const fn = file?.functions.find((f) => f.name === ref.name);
      return okAsync(fn?.contract ?? { params: [], returnType: 'void' });
    },
    getCallSites: (ref) => {
      const file = byFile.get(ref.filePath);
      const fn = file?.functions.find((f) => f.name === ref.name);
      return okAsync(
        (fn?.calls ?? []).map((c) => ({
          line: c.line,
          column: c.column ?? 1,
          awaited: c.awaited ?? false,
          context: c.context ?? 'plain',
          target: c.target,
          ...(c.firstArgLiteral !== undefined ? { firstArgLiteral: c.firstArgLiteral } : {}),
        })),
      );
    },
    getClassDeclarations: (filePath) => okAsync(classDeclarationsOf(byFile.get(filePath))),
  };
};

const classDeclFromExplicit = (
  classDecl: NonNullable<FakeFile['classDecl']>,
): ClassDeclarationInfo => ({
  name: classDecl.name,
  ...(classDecl.exportName !== undefined ? { exportName: classDecl.exportName } : {}),
  loc: classDecl.loc ?? { start: 1, end: 5 },
  decorators: classDecl.decorators ?? [],
  exported: true,
});

// classDecl 省略時(FakeFile.classDecl のコメント通り「クラスを持つファイルでも
// decorators/loc を検証しないテストでは省略可」)は、そのファイルの methods から単一の
// クラス名を合成する。デコレータ/エイリアスを検証するテストは classDecl を明示するため、
// 合成対象にはならない
const synthesizedClassDecl = (file: FakeFile): ClassDeclarationInfo | undefined => {
  const owners = new Set(
    file.functions.map((fn) => fn.owner).filter((owner) => owner !== undefined),
  );
  if (owners.size !== 1) return undefined;
  const [name] = [...owners];
  return name === undefined
    ? undefined
    : { name, loc: { start: 1, end: 5 }, decorators: [], exported: true };
};

// buildFakeDeps.getClassDeclarations からの抽出(複雑度低減)
const classDeclarationsOf = (file: FakeFile | undefined): readonly ClassDeclarationInfo[] => {
  if (!file) return [];
  const decl = file.classDecl ? classDeclFromExplicit(file.classDecl) : synthesizedClassDecl(file);
  return decl === undefined ? [] : [decl];
};

describe('buildDependencyGraph', () => {
  it('walks a linear DI chain controller -> service -> config and enumerates each method as a FnNode', async () => {
    const files: FakeFile[] = [
      {
        filePath: 'src/a.controller.ts',
        functions: [
          { name: 'handle', owner: 'AController', contract: { params: [], returnType: 'void' } },
        ],
      },
      {
        filePath: 'src/b.service.ts',
        functions: [
          { name: 'run', owner: 'BService', contract: { params: [], returnType: 'void' } },
        ],
      },
    ];
    const depsMap = new Map([
      [
        'src/a.controller.ts#AController',
        [{ kind: 'class', source: src('src/b.service.ts', 'BService'), line: 11 } as const],
      ],
      ['src/b.service.ts#BService', []],
    ]);
    const root: GraphRootV3 = {
      className: 'AController',
      source: src('src/a.controller.ts', 'AController'),
    };

    const graph = await graphOk(buildDependencyGraph([root], buildFakeDeps(files, depsMap)));

    expect(graph.version).toBe(3);
    expect(graph.tests).toEqual([]);
    const classNodes = graph.nodes.filter(isClassNode);
    expect(classNodes.map((n) => fieldsOf(n).name).sort()).toEqual(['AController', 'BService']);
    const fnNodes = graph.nodes.filter(isFnNode);
    expect(fnNodes.map((n) => fieldsOf(n).name).sort()).toEqual(['handle', 'run']);
    expect(graph.edges).toContainEqual({
      kind: 'injects',
      from: 'src/a.controller.ts#AController',
      to: 'src/b.service.ts#BService',
      line: expect.any(Number),
    });
  });
});

describe('buildDependencyGraph (external, entry, event, unresolved)', () => {
  it('creates an ExternalNode for a node_modules class reached via inject(), not a plain ClassNode', async () => {
    const files: FakeFile[] = [
      {
        filePath: 'src/order.service.ts',
        functions: [{ name: 'createOrder', owner: 'OrderService' }],
      },
    ];
    const depsMap = new Map<string, readonly DependencyResolution[]>([
      [
        'src/order.service.ts#OrderService',
        [
          {
            kind: 'class',
            source: {
              filePath: '/repo/node_modules/@zeltjs/eventbus/dist/index.js',
              exportName: 'MemoryEventBusAdaptor',
            },
            line: 16,
          },
        ],
      ],
    ]);
    const root: GraphRootV3 = {
      className: 'OrderService',
      source: src('src/order.service.ts', 'OrderService'),
    };

    const graph = await graphOk(buildDependencyGraph([root], buildFakeDeps(files, depsMap)));

    const externalNodes = graph.nodes.filter(isExternalNode);
    expect(externalNodes).toHaveLength(1);
    expect(externalNodes[0]?.id).toBe('ext:@zeltjs/eventbus#MemoryEventBusAdaptor');
    expect(graph.edges).toContainEqual({
      kind: 'injects',
      from: 'src/order.service.ts#OrderService',
      to: 'ext:@zeltjs/eventbus#MemoryEventBusAdaptor',
      line: 16,
    });
    // node_modules 由来のクラスは ClassNode として queue に積まれない(関数列挙されない)
    expect(graph.nodes.filter(isClassNode)).toHaveLength(1); // OrderService のみ
  });

  it('sets entry:http on a route handler method using the root routes', async () => {
    const files: FakeFile[] = [
      { filePath: 'src/a.controller.ts', functions: [{ name: 'list', owner: 'AController' }] },
    ];
    const root: GraphRootV3 = {
      className: 'AController',
      source: src('src/a.controller.ts', 'AController'),
      routes: [{ method: 'GET', path: '/api/a', handler: 'list' }],
    };
    const graph = await graphOk(buildDependencyGraph([root], buildFakeDeps(files, new Map())));
    const fn = graph.nodes.find((n) => n.id === 'src/a.controller.ts#AController.list');
    expect(fieldsOf(fn ?? ({} as GraphNodeV3)).entry).toEqual({
      kind: 'http',
      method: 'GET',
      path: '/api/a',
    });
  });

  it('sets entry:middleware on the use() method of a @Middleware root', async () => {
    const files: FakeFile[] = [
      {
        filePath: 'src/logging.middleware.ts',
        classDecl: {
          name: 'LoggingMiddleware',
          decorators: [{ name: 'Middleware', line: 4, args: [] }],
        },
        functions: [{ name: 'use', owner: 'LoggingMiddleware' }],
      },
    ];
    const root: GraphRootV3 = {
      className: 'LoggingMiddleware',
      source: src('src/logging.middleware.ts', 'LoggingMiddleware'),
    };
    const graph = await graphOk(buildDependencyGraph([root], buildFakeDeps(files, new Map())));
    const fn = graph.nodes.find((n) => n.id === 'src/logging.middleware.ts#LoggingMiddleware.use');
    expect(fieldsOf(fn ?? ({} as GraphNodeV3)).entry).toEqual({
      kind: 'middleware',
      name: 'LoggingMiddleware',
    });
  });

  it('resolves the applies-middleware edge line from the class-level @UseMiddleware(X) decorator by matching X in args, not by declaration order (team-lead decision)', async () => {
    const files: FakeFile[] = [
      {
        filePath: 'src/cart.controller.ts',
        // 2つの @UseMiddleware(...) が同じクラスにあるケース。宣言順ではなく
        // args の識別子名で一致させることを検証する(AuthMiddleware が2番目でも見つかる)
        classDecl: {
          name: 'CartController',
          decorators: [
            {
              name: 'UseMiddleware',
              line: 5,
              args: [src('src/logging.middleware.ts', 'LoggingMiddleware')],
            },
            {
              name: 'UseMiddleware',
              line: 6,
              args: [src('src/auth.middleware.ts', 'AuthMiddleware')],
            },
            { name: 'Controller', line: 7, args: [] },
          ],
        },
        functions: [{ name: 'list', owner: 'CartController' }],
      },
      // 逸脱(テストフィクスチャの補完): applies-middleware の宛先クラス自身も
      // seedClassOrExternal(getClassDeclarations 経由)で解決するため、宛先ファイルの
      // FakeFile を用意する必要がある(ブリーフ原文には無かった。宛先ファイル無しでは
      // DECLARATION_NOT_FOUND になり、このテストの意図(line 突き合わせの検証)を
      // 検証できない)
      {
        filePath: 'src/logging.middleware.ts',
        classDecl: { name: 'LoggingMiddleware', decorators: [] },
        functions: [],
      },
      {
        filePath: 'src/auth.middleware.ts',
        classDecl: { name: 'AuthMiddleware', decorators: [] },
        functions: [],
      },
    ];
    const root: GraphRootV3 = {
      className: 'CartController',
      source: src('src/cart.controller.ts', 'CartController'),
      appliedMiddlewares: [
        {
          className: 'LoggingMiddleware',
          source: src('src/logging.middleware.ts', 'LoggingMiddleware'),
        },
        { className: 'AuthMiddleware', source: src('src/auth.middleware.ts', 'AuthMiddleware') },
      ],
    };
    const graph = await graphOk(buildDependencyGraph([root], buildFakeDeps(files, new Map())));

    expect(graph.edges).toContainEqual(
      expect.objectContaining({
        kind: 'applies-middleware',
        to: 'src/logging.middleware.ts#LoggingMiddleware',
        line: 5,
      }),
    );
    expect(graph.edges).toContainEqual(
      expect.objectContaining({
        kind: 'applies-middleware',
        to: 'src/auth.middleware.ts#AuthMiddleware',
        line: 6,
      }),
    );
  });

  // team-lead 決定(Task 10 ブロッカーA): `@RateLimit({...})` のような decorator ファクトリ
  // 経由の適用は AST 上 literal な `UseMiddleware` という decorator 名を持たない
  // (実例: ec-backend の AuthController.register/login)。この場合 analyzer-entry.ts が
  // 実行時メタデータから解決した mw.line にフォールバックすることを検証する
  it('falls back to the runtime-resolved mw.line when no literal @UseMiddleware(X) decorator is found in the AST (decorator-factory case, e.g. @RateLimit)', async () => {
    const files: FakeFile[] = [
      {
        filePath: 'src/auth.controller.ts',
        classDecl: { name: 'AuthController', decorators: [] },
        functions: [
          {
            name: 'register',
            owner: 'AuthController',
            // AST 上は `RateLimit` という名前の decorator しかない(UseMiddleware ではない)
            decorators: [{ name: 'RateLimit', line: 13, args: [] }],
          },
        ],
      },
      {
        filePath: 'src/rate-limit.middleware.ts',
        classDecl: { name: 'RateLimitMiddleware', decorators: [] },
        functions: [],
      },
    ];
    const root: GraphRootV3 = {
      className: 'AuthController',
      source: src('src/auth.controller.ts', 'AuthController'),
      appliedMiddlewares: [
        {
          className: 'RateLimitMiddleware',
          source: src('src/rate-limit.middleware.ts', 'RateLimitMiddleware'),
          methods: ['register'],
          line: 13,
        },
      ],
    };
    const graph = await graphOk(buildDependencyGraph([root], buildFakeDeps(files, new Map())));

    expect(graph.edges).toContainEqual({
      kind: 'applies-middleware',
      from: 'src/auth.controller.ts#AuthController',
      to: 'src/rate-limit.middleware.ts#RateLimitMiddleware',
      methods: ['register'],
      line: 13,
    });
  });

  // レビュー指摘8の fail-loud は最終手段として残る: AST の literal 一致も、実行時解決の
  // mw.line も両方無い場合は DECLARATION_NOT_FOUND で失敗する(黙って line:0 にしない)
  it('still fails with DECLARATION_NOT_FOUND when neither the AST literal match nor a runtime-resolved mw.line is available', async () => {
    const files: FakeFile[] = [
      {
        filePath: 'src/auth.controller.ts',
        classDecl: { name: 'AuthController', decorators: [] },
        functions: [
          {
            name: 'register',
            owner: 'AuthController',
            decorators: [{ name: 'RateLimit', line: 13, args: [] }],
          },
        ],
      },
      {
        filePath: 'src/rate-limit.middleware.ts',
        classDecl: { name: 'RateLimitMiddleware', decorators: [] },
        functions: [],
      },
    ];
    const root: GraphRootV3 = {
      className: 'AuthController',
      source: src('src/auth.controller.ts', 'AuthController'),
      appliedMiddlewares: [
        {
          className: 'RateLimitMiddleware',
          source: src('src/rate-limit.middleware.ts', 'RateLimitMiddleware'),
          methods: ['register'],
          // line なし: 実行時位置解決も失敗したケースを模す
        },
      ],
    };
    const result = await buildDependencyGraph([root], buildFakeDeps(files, new Map()));
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('DECLARATION_NOT_FOUND');
  });

  it('resolves the applies-middleware edge line from a method-level @UseMiddleware(X) decorator', async () => {
    const files: FakeFile[] = [
      {
        filePath: 'src/auth.controller.ts',
        classDecl: { name: 'AuthController', decorators: [] },
        functions: [
          {
            name: 'me',
            owner: 'AuthController',
            decorators: [
              {
                name: 'UseMiddleware',
                line: 9,
                args: [src('src/jwt.middleware.ts', 'JwtMiddleware')],
              },
            ],
          },
        ],
      },
      // 逸脱(テストフィクスチャの補完): 上のテストと同じ理由で宛先ファイルの FakeFile が要る
      {
        filePath: 'src/jwt.middleware.ts',
        classDecl: { name: 'JwtMiddleware', decorators: [] },
        functions: [],
      },
    ];
    const root: GraphRootV3 = {
      className: 'AuthController',
      source: src('src/auth.controller.ts', 'AuthController'),
      appliedMiddlewares: [
        {
          className: 'JwtMiddleware',
          source: src('src/jwt.middleware.ts', 'JwtMiddleware'),
          methods: ['me'],
        },
      ],
    };
    const graph = await graphOk(buildDependencyGraph([root], buildFakeDeps(files, new Map())));

    expect(graph.edges).toContainEqual({
      kind: 'applies-middleware',
      from: 'src/auth.controller.ts#AuthController',
      to: 'src/jwt.middleware.ts#JwtMiddleware',
      methods: ['me'],
      line: 9,
    });
  });

  it('creates one applies-middleware edge per method occurrence when the same middleware is applied to 3 methods (レビュー指摘10, ProductController と同じ形)', async () => {
    const files: FakeFile[] = [
      {
        filePath: 'src/product.controller.ts',
        classDecl: { name: 'ProductController', decorators: [] },
        functions: [
          {
            name: 'create',
            owner: 'ProductController',
            decorators: [
              {
                name: 'UseMiddleware',
                line: 10,
                args: [src('src/jwt.middleware.ts', 'JwtMiddleware')],
              },
            ],
          },
          {
            name: 'update',
            owner: 'ProductController',
            decorators: [
              {
                name: 'UseMiddleware',
                line: 20,
                args: [src('src/jwt.middleware.ts', 'JwtMiddleware')],
              },
            ],
          },
          {
            name: 'remove',
            owner: 'ProductController',
            decorators: [
              {
                name: 'UseMiddleware',
                line: 30,
                args: [src('src/jwt.middleware.ts', 'JwtMiddleware')],
              },
            ],
          },
        ],
      },
      // 逸脱(テストフィクスチャの補完): 上のテストと同じ理由で宛先ファイルの FakeFile が要る
      {
        filePath: 'src/jwt.middleware.ts',
        classDecl: { name: 'JwtMiddleware', decorators: [] },
        functions: [],
      },
    ];
    // appliedMiddlewaresOf(analyzer-entry.ts)の展開結果を模す: 1 middleware x 3 メソッド = 3件
    const root: GraphRootV3 = {
      className: 'ProductController',
      source: src('src/product.controller.ts', 'ProductController'),
      appliedMiddlewares: [
        {
          className: 'JwtMiddleware',
          source: src('src/jwt.middleware.ts', 'JwtMiddleware'),
          methods: ['create'],
        },
        {
          className: 'JwtMiddleware',
          source: src('src/jwt.middleware.ts', 'JwtMiddleware'),
          methods: ['update'],
        },
        {
          className: 'JwtMiddleware',
          source: src('src/jwt.middleware.ts', 'JwtMiddleware'),
          methods: ['remove'],
        },
      ],
    };
    const graph = await graphOk(buildDependencyGraph([root], buildFakeDeps(files, new Map())));

    const middlewareEdges = graph.edges.filter(
      (e) => e.kind === 'applies-middleware' && e.to === 'src/jwt.middleware.ts#JwtMiddleware',
    );
    expect(middlewareEdges).toHaveLength(3);
    expect(middlewareEdges).toContainEqual({
      kind: 'applies-middleware',
      from: 'src/product.controller.ts#ProductController',
      to: 'src/jwt.middleware.ts#JwtMiddleware',
      methods: ['create'],
      line: 10,
    });
    expect(middlewareEdges).toContainEqual({
      kind: 'applies-middleware',
      from: 'src/product.controller.ts#ProductController',
      to: 'src/jwt.middleware.ts#JwtMiddleware',
      methods: ['update'],
      line: 20,
    });
    expect(middlewareEdges).toContainEqual({
      kind: 'applies-middleware',
      from: 'src/product.controller.ts#ProductController',
      to: 'src/jwt.middleware.ts#JwtMiddleware',
      methods: ['remove'],
      line: 30,
    });
  });

  it('creates an EventEdge when an emit call and a subscribe call share the same string literal', async () => {
    const files: FakeFile[] = [
      {
        filePath: 'src/order.service.ts',
        functions: [
          {
            name: 'createOrder',
            owner: 'OrderService',
            calls: [
              {
                line: 40,
                firstArgLiteral: 'order:created',
                target: {
                  kind: 'external',
                  package: '@zeltjs/eventbus',
                  member: 'MemoryEventBusAdaptor.emit',
                },
              },
            ],
          },
        ],
      },
      {
        filePath: 'src/order.handlers.ts',
        functions: [
          {
            name: 'startup',
            owner: 'OrderHandlers',
            calls: [
              {
                line: 10,
                firstArgLiteral: 'order:created',
                target: {
                  kind: 'external',
                  package: '@zeltjs/eventbus',
                  member: 'MemoryEventBusAdaptor.on',
                },
              },
            ],
          },
        ],
      },
    ];
    const roots: GraphRootV3[] = [
      { className: 'OrderService', source: src('src/order.service.ts', 'OrderService') },
      { className: 'OrderHandlers', source: src('src/order.handlers.ts', 'OrderHandlers') },
    ];
    const graph = await graphOk(buildDependencyGraph(roots, buildFakeDeps(files, new Map())));

    expect(graph.edges).toContainEqual({
      kind: 'event',
      from: 'src/order.service.ts#OrderService.createOrder',
      to: 'src/order.handlers.ts#OrderHandlers.startup',
      event: 'order:created',
      line: 40,
    });
    // emit/on への calls エッジ自体は残る(5(e): 別事実として併存させる)
    expect(graph.edges).toContainEqual(
      expect.objectContaining({
        kind: 'calls',
        from: 'src/order.service.ts#OrderService.createOrder',
      }),
    );
    // subscribe 候補を含む関数には emit の有無によらず entry:event が付く
    const startupNode = graph.nodes.find(
      (n) => n.id === 'src/order.handlers.ts#OrderHandlers.startup',
    );
    expect(fieldsOf(startupNode ?? ({} as GraphNodeV3)).entry).toEqual({
      kind: 'event',
      event: 'order:created',
    });
  });

  it('records two separate EventEdges for two emit calls on the same line at different columns (レビュー再指摘10)', async () => {
    // `eventBus.emit('order:created'); eventBus.emit('order:created');` を1行に書いた
    // ケースを模す。line だけを辺重複排除キーにすると2件目が消えてしまう
    const files: FakeFile[] = [
      {
        filePath: 'src/order.service.ts',
        functions: [
          {
            name: 'createOrder',
            owner: 'OrderService',
            calls: [
              {
                line: 40,
                column: 3,
                firstArgLiteral: 'order:created',
                target: {
                  kind: 'external',
                  package: '@zeltjs/eventbus',
                  member: 'MemoryEventBusAdaptor.emit',
                },
              },
              {
                line: 40,
                column: 40,
                firstArgLiteral: 'order:created',
                target: {
                  kind: 'external',
                  package: '@zeltjs/eventbus',
                  member: 'MemoryEventBusAdaptor.emit',
                },
              },
            ],
          },
        ],
      },
      {
        filePath: 'src/order.handlers.ts',
        functions: [
          {
            name: 'startup',
            owner: 'OrderHandlers',
            calls: [
              {
                line: 10,
                firstArgLiteral: 'order:created',
                target: {
                  kind: 'external',
                  package: '@zeltjs/eventbus',
                  member: 'MemoryEventBusAdaptor.on',
                },
              },
            ],
          },
        ],
      },
    ];
    const roots: GraphRootV3[] = [
      { className: 'OrderService', source: src('src/order.service.ts', 'OrderService') },
      { className: 'OrderHandlers', source: src('src/order.handlers.ts', 'OrderHandlers') },
    ];
    const graph = await graphOk(buildDependencyGraph(roots, buildFakeDeps(files, new Map())));

    const eventEdges = graph.edges.filter(
      (e) =>
        e.kind === 'event' &&
        e.from === 'src/order.service.ts#OrderService.createOrder' &&
        e.to === 'src/order.handlers.ts#OrderHandlers.startup',
    );
    expect(eventEdges).toHaveLength(2);
  });

  it('records two separate EventEdges when the subscribe side has two calls on different lines at the same column (team-lead review fix)', async () => {
    // 縦に揃えて書かれた2つの `this.bus.on('order:created', …)` を模す。line は違うが
    // column は同じ。dedupSuffix が emit 側の occurrence だけ・あるいは column だけしか
    // 見ないと、この2件が同じキーに潰れてしまう
    const files: FakeFile[] = [
      {
        filePath: 'src/order.service.ts',
        functions: [
          {
            name: 'createOrder',
            owner: 'OrderService',
            calls: [
              {
                line: 40,
                firstArgLiteral: 'order:created',
                target: {
                  kind: 'external',
                  package: '@zeltjs/eventbus',
                  member: 'MemoryEventBusAdaptor.emit',
                },
              },
            ],
          },
        ],
      },
      {
        filePath: 'src/order.handlers.ts',
        functions: [
          {
            name: 'startup',
            owner: 'OrderHandlers',
            calls: [
              {
                line: 10,
                column: 5,
                firstArgLiteral: 'order:created',
                target: {
                  kind: 'external',
                  package: '@zeltjs/eventbus',
                  member: 'MemoryEventBusAdaptor.on',
                },
              },
              {
                line: 11,
                column: 5,
                firstArgLiteral: 'order:created',
                target: {
                  kind: 'external',
                  package: '@zeltjs/eventbus',
                  member: 'MemoryEventBusAdaptor.on',
                },
              },
            ],
          },
        ],
      },
    ];
    const roots: GraphRootV3[] = [
      { className: 'OrderService', source: src('src/order.service.ts', 'OrderService') },
      { className: 'OrderHandlers', source: src('src/order.handlers.ts', 'OrderHandlers') },
    ];
    const graph = await graphOk(buildDependencyGraph(roots, buildFakeDeps(files, new Map())));

    const eventEdges = graph.edges.filter(
      (e) =>
        e.kind === 'event' &&
        e.from === 'src/order.service.ts#OrderService.createOrder' &&
        e.to === 'src/order.handlers.ts#OrderHandlers.startup',
    );
    expect(eventEdges).toHaveLength(2);
  });

  it('does not create an EventEdge for a non-eventbus package with the same emit/on names', async () => {
    const files: FakeFile[] = [
      {
        filePath: 'src/other.service.ts',
        functions: [
          {
            name: 'run',
            owner: 'OtherService',
            calls: [
              {
                line: 5,
                firstArgLiteral: 'order:created',
                target: { kind: 'external', package: 'some-other-lib', member: 'emit' },
              },
            ],
          },
        ],
      },
    ];
    const root: GraphRootV3 = {
      className: 'OtherService',
      source: src('src/other.service.ts', 'OtherService'),
    };
    const graph = await graphOk(buildDependencyGraph([root], buildFakeDeps(files, new Map())));
    expect(graph.edges.filter((e) => e.kind === 'event')).toHaveLength(0);
  });

  it('fails with MULTIPLE_ENTRIES when a function subscribes to two different events (レビュー再指摘4)', async () => {
    // 以前は最初に見つかった event entry を優先し、後続の異なる event candidate を
    // 黙って無視していた。「1関数=1entry」の前提が崩れる実データであり fail する
    const files: FakeFile[] = [
      {
        filePath: 'src/multi.handlers.ts',
        functions: [
          {
            name: 'startup',
            owner: 'MultiHandlers',
            calls: [
              {
                line: 10,
                firstArgLiteral: 'order:created',
                target: {
                  kind: 'external',
                  package: '@zeltjs/eventbus',
                  member: 'MemoryEventBusAdaptor.on',
                },
              },
              {
                line: 11,
                firstArgLiteral: 'order:cancelled',
                target: {
                  kind: 'external',
                  package: '@zeltjs/eventbus',
                  member: 'MemoryEventBusAdaptor.on',
                },
              },
            ],
          },
        ],
      },
    ];
    const root: GraphRootV3 = {
      className: 'MultiHandlers',
      source: src('src/multi.handlers.ts', 'MultiHandlers'),
    };
    const result = await buildDependencyGraph([root], buildFakeDeps(files, new Map()));
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('MULTIPLE_ENTRIES');
  });

  it('fails with MULTIPLE_ENTRIES when a route handler also matches an event-subscribe call pattern (レビュー再指摘4)', async () => {
    // handle は route(http entry)と on(...)(event candidate)の両方に該当する競合ケース。
    // http entry を無条件優先して黙送するのではなく、異なる entry 候補として fail する
    const files: FakeFile[] = [
      {
        filePath: 'src/weird.controller.ts',
        classDecl: { name: 'WeirdController', decorators: [] },
        functions: [
          {
            name: 'handle',
            owner: 'WeirdController',
            calls: [
              {
                line: 5,
                firstArgLiteral: 'order:created',
                target: {
                  kind: 'external',
                  package: '@zeltjs/eventbus',
                  member: 'MemoryEventBusAdaptor.on',
                },
              },
            ],
          },
        ],
      },
    ];
    const root: GraphRootV3 = {
      className: 'WeirdController',
      source: src('src/weird.controller.ts', 'WeirdController'),
      routes: [{ method: 'GET', path: '/weird', handler: 'handle' }],
    };
    const result = await buildDependencyGraph([root], buildFakeDeps(files, new Map()));
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('MULTIPLE_ENTRIES');
  });

  it('records unresolvedCalls on the FnNode without creating a calls edge', async () => {
    const files: FakeFile[] = [
      {
        filePath: 'src/logging.middleware.ts',
        functions: [
          {
            name: 'use',
            owner: 'LoggingMiddleware',
            calls: [
              {
                line: 10,
                target: { kind: 'unresolved', expression: 'next()', reason: 'parameter-callback' },
              },
            ],
          },
        ],
      },
    ];
    const root: GraphRootV3 = {
      className: 'LoggingMiddleware',
      source: src('src/logging.middleware.ts', 'LoggingMiddleware'),
    };
    const graph = await graphOk(buildDependencyGraph([root], buildFakeDeps(files, new Map())));
    const fn = graph.nodes.find((n) => n.id === 'src/logging.middleware.ts#LoggingMiddleware.use');
    expect(fieldsOf(fn ?? ({} as GraphNodeV3)).unresolvedCalls).toEqual([
      { line: 10, expression: 'next()', reason: 'parameter-callback' },
    ]);
    expect(graph.edges.filter((e) => e.kind === 'calls')).toHaveLength(0);
  });

  it('discovers a module-scope function reached only via an internal call from another file', async () => {
    const files: FakeFile[] = [
      {
        filePath: 'src/auth.controller.ts',
        functions: [
          {
            name: 'me',
            owner: 'AuthController',
            calls: [
              {
                line: 3,
                target: {
                  kind: 'internal',
                  ref: {
                    kind: 'function',
                    filePath: 'src/current-user.lib.ts',
                    name: 'requireUser',
                  },
                },
              },
            ],
          },
        ],
      },
      { filePath: 'src/current-user.lib.ts', functions: [{ name: 'requireUser' }] },
    ];
    const root: GraphRootV3 = {
      className: 'AuthController',
      source: src('src/auth.controller.ts', 'AuthController'),
    };
    const graph = await graphOk(buildDependencyGraph([root], buildFakeDeps(files, new Map())));
    expect(graph.nodes.find((n) => n.id === 'src/current-user.lib.ts#requireUser')).toBeDefined();
    expect(graph.edges).toContainEqual({
      kind: 'calls',
      from: 'src/auth.controller.ts#AuthController.me',
      to: 'src/current-user.lib.ts#requireUser',
      context: 'plain',
      awaited: false,
      line: 3,
    });
  });

  it('seeds a ClassNode for an internal-class target via getClassDeclarations and enumerates its methods too (team-lead decision 10)', async () => {
    const files: FakeFile[] = [
      {
        filePath: 'src/caller.ts',
        functions: [
          {
            name: 'make',
            owner: 'Caller',
            calls: [
              {
                line: 7,
                target: { kind: 'internal-class', filePath: 'src/helper.ts', name: 'Helper' },
              },
            ],
          },
        ],
      },
      {
        filePath: 'src/helper.ts',
        classDecl: { name: 'Helper', decorators: [] },
        functions: [{ name: 'ping', owner: 'Helper' }],
      },
    ];
    const root: GraphRootV3 = { className: 'Caller', source: src('src/caller.ts', 'Caller') };
    const graph = await graphOk(buildDependencyGraph([root], buildFakeDeps(files, new Map())));

    const helperNode = graph.nodes.find((n) => n.id === 'src/helper.ts#Helper');
    expect(fieldsOf(helperNode ?? ({} as GraphNodeV3)).kind).toBe('class');
    expect(graph.edges).toContainEqual(
      expect.objectContaining({ kind: 'calls', to: 'src/helper.ts#Helper' }),
    );
    // new X() で発見された internal クラスも、DI 発見と同様にそのファイルの関数が列挙される
    expect(graph.nodes.find((n) => n.id === 'src/helper.ts#Helper.ping')).toBeDefined();
  });

  it('fails with DECLARATION_NOT_FOUND for an internal-class target when getClassDeclarations has no matching entry (fixture omission, not a real gap)', async () => {
    const files: FakeFile[] = [
      {
        filePath: 'src/caller2.ts',
        functions: [
          {
            name: 'make',
            owner: 'Caller2',
            calls: [
              {
                line: 7,
                target: { kind: 'internal-class', filePath: 'src/helper2.ts', name: 'Helper2' },
              },
            ],
          },
        ],
      },
      // src/helper2.ts は意図的に FakeFile を用意しない(getClassDeclarations が [] を返す)
    ];
    const root: GraphRootV3 = { className: 'Caller2', source: src('src/caller2.ts', 'Caller2') };
    // レビュー指摘8: classDeclarationByName/classDeclarationByExportName は宣言が見つからない場合、loc{0,0}/空decorators への
    // フォールバックをせず fail する。実運用では getCallSites が internal-class と判定した時点で
    // プログラム内に実在することが保証されるため、これが発生するのは本テストのような
    // フィクスチャ不備(または実装バグ)のみであり、黙って握り潰さずエラーにする
    const result = await buildDependencyGraph([root], buildFakeDeps(files, new Map()));
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('DECLARATION_NOT_FOUND');
  });

  it('fails with DUPLICATE_NODE_ID when a class has a getter and setter with the same name (colliding FnNode ids)', async () => {
    // getter/setter は別の TypeScript 宣言だが、Task 1 の設計判断メモ12(get/set accessor を
    // FnNode に含める)により同名なら fnNodeId が衝突しうる。実際には getFunctionDeclarations が
    // アクセサごとに別 CollectedFunction を返すため、このテストは意図的に fake resolver 側で
    // 同名 2件を返すフィクスチャを組み、enqueueFunctionsOfClass の重複検出が機能することを見る
    const files: FakeFile[] = [
      {
        filePath: 'src/dup.service.ts',
        classDecl: { name: 'DupService', decorators: [] },
        functions: [
          { name: 'value', owner: 'DupService' },
          { name: 'value', owner: 'DupService' }, // getter/setter が同じ name で 2件返るケースを模す
        ],
      },
    ];
    const root: GraphRootV3 = {
      className: 'DupService',
      source: src('src/dup.service.ts', 'DupService'),
    };
    const result = await buildDependencyGraph([root], buildFakeDeps(files, new Map()));
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('DUPLICATE_NODE_ID');
  });

  it('fails with MULTIPLE_ENTRIES when two route decorators target the same handler method', async () => {
    const files: FakeFile[] = [
      {
        filePath: 'src/dup.controller.ts',
        classDecl: { name: 'DupController', decorators: [] },
        functions: [{ name: 'handle', owner: 'DupController' }],
      },
    ];
    const root: GraphRootV3 = {
      className: 'DupController',
      source: src('src/dup.controller.ts', 'DupController'),
      routes: [
        { method: 'GET', path: '/a', handler: 'handle' },
        { method: 'POST', path: '/b', handler: 'handle' }, // 同一 handler に 2 つの route decorator
      ],
    };
    const result = await buildDependencyGraph([root], buildFakeDeps(files, new Map()));
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('MULTIPLE_ENTRIES');
  });

  it('maps a non-BuildGraphFailure exception to UNEXPECTED_ERROR instead of rejecting (レビュー再指摘2)', async () => {
    // ResultAsync.fromPromise の mapError が実際に機能していることの回帰テスト。
    // fromSafePromise のままだとこの fake resolver の reject がそのまま Promise の reject に
    // なり、buildDependencyGraph 自体が reject する(ResultAsync の契約違反)ままになっていた
    const files: FakeFile[] = [
      {
        filePath: 'src/boom.service.ts',
        // classDecl を設定しておくことで seedClassOrExternal/classDeclarationByExportName
        // (getClassDeclarations 経由)は成功させ、失敗ポイントを getFunctionDeclarations
        // (enqueueFunctionsOfClass 経由)に限定する
        classDecl: { name: 'BoomService', decorators: [] },
        functions: [{ name: 'run', owner: 'BoomService' }],
      },
    ];
    const deps = buildFakeDeps(files, new Map());
    const boom: BuildGraphV3Deps = {
      ...deps,
      // 意図的に ResultAsync を返さず throw する(規約違反のバグを模す)。関数の宣言時点で
      // 戻り値型を明示することで `as` 断言なしに BuildGraphV3Deps へ代入できる
      // (throw のみの関数本体は any の戻り値型を満たすとみなされる)
      getFunctionDeclarations: (): ResultAsync<
        readonly FunctionDeclarationInfo[],
        InspectError | ProgramCacheError
      > => {
        throw new Error('boom: not a BuildGraphFailure');
      },
    };
    const root: GraphRootV3 = {
      className: 'BoomService',
      source: src('src/boom.service.ts', 'BoomService'),
    };
    const result = await buildDependencyGraph([root], boom);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      const { error } = result;
      // 逸脱: `expect(error.code).toBe(...)` は型の絞り込みに寄与しないため、`cause`
      // (BuildGraphError 固有のフィールド)へのアクセスが union のままだと型エラーになる。
      // 判別プロパティの値比較そのもの(if (error.code !== 'UNEXPECTED_ERROR'))で
      // 絞り込む形に書き換える
      if (error.code !== 'UNEXPECTED_ERROR')
        throw new Error(`unexpected error code: ${error.code}`);
      expect(error.message).toBe('boom: not a BuildGraphFailure');
      expect(error.cause).toBeInstanceOf(Error);
    }
  });

  it('records two separate calls edges for two calls on the same line at different columns to the same target (レビュー指摘12)', async () => {
    const files: FakeFile[] = [
      {
        filePath: 'src/twocalls.service.ts',
        functions: [
          {
            name: 'run',
            owner: 'TwoCallsService',
            calls: [
              // `helper.ping(); helper.ping();` を1行に書いたケースを模す。line は同じで
              // column だけが異なる。addEdge の辺重複排除キーが line だけだと1件に潰れてしまう
              {
                line: 5,
                column: 5,
                target: {
                  kind: 'internal',
                  ref: { kind: 'method', filePath: 'src/helper.ts', owner: 'Helper', name: 'ping' },
                },
              },
              {
                line: 5,
                column: 20,
                target: {
                  kind: 'internal',
                  ref: { kind: 'method', filePath: 'src/helper.ts', owner: 'Helper', name: 'ping' },
                },
              },
            ],
          },
        ],
      },
      {
        filePath: 'src/helper.ts',
        classDecl: { name: 'Helper', decorators: [] },
        functions: [{ name: 'ping', owner: 'Helper' }],
      },
    ];
    const root: GraphRootV3 = {
      className: 'TwoCallsService',
      source: src('src/twocalls.service.ts', 'TwoCallsService'),
    };
    const graph = await graphOk(buildDependencyGraph([root], buildFakeDeps(files, new Map())));

    const callsEdges = graph.edges.filter(
      (e) => e.kind === 'calls' && e.to === 'src/helper.ts#Helper.ping',
    );
    expect(callsEdges).toHaveLength(2);
    // JSON に出す CallsEdge 自体には column を含めない(line のみ)
    expect(callsEdges.every((e) => e.kind === 'calls' && e.line === 5)).toBe(true);
  });

  it('レビュー指摘6: uses the declaration name (not "default") for a default-exported root class', async () => {
    const files: FakeFile[] = [
      {
        filePath: 'src/default-export.service.ts',
        // ClassSource.exportName は import identity('default')でしかなく、ClassNode の
        // id/name には使えない。classDeclarationByExportName が exportName(無ければ name)で該当宣言を
        // 探し、見つかった宣言の name(宣言名)を正準の識別子として使うことを確認する
        classDecl: { name: 'DefaultExportedService', exportName: 'default', decorators: [] },
        functions: [{ name: 'run', owner: 'DefaultExportedService' }],
      },
    ];
    // GraphRootV3.source は default export の import identity('default')を持つ
    const root: GraphRootV3 = {
      className: 'DefaultExportedService',
      source: src('src/default-export.service.ts', 'default'),
    };
    const graph = await graphOk(buildDependencyGraph([root], buildFakeDeps(files, new Map())));

    expect(graph.nodes).toContainEqual(
      expect.objectContaining({
        id: 'src/default-export.service.ts#DefaultExportedService',
        kind: 'class',
      }),
    );
    expect(
      graph.nodes.find((n) => n.id === 'src/default-export.service.ts#default'),
    ).toBeUndefined();
    expect(graph.nodes).toContainEqual(
      expect.objectContaining({ id: 'src/default-export.service.ts#DefaultExportedService.run' }),
    );
  });

  it('レビュー指摘6: uses the declaration name (not the re-export alias) for an `export { A as B }` root class', async () => {
    const files: FakeFile[] = [
      {
        filePath: 'src/aliased-export.service.ts',
        classDecl: { name: 'RealServiceName', exportName: 'PublicAlias', decorators: [] },
        functions: [{ name: 'run', owner: 'RealServiceName' }],
      },
    ];
    // GraphRootV3.source は `export { RealServiceName as PublicAlias }` の公開名を持つ
    const root: GraphRootV3 = {
      className: 'RealServiceName',
      source: src('src/aliased-export.service.ts', 'PublicAlias'),
    };
    const graph = await graphOk(buildDependencyGraph([root], buildFakeDeps(files, new Map())));

    expect(graph.nodes).toContainEqual(
      expect.objectContaining({
        id: 'src/aliased-export.service.ts#RealServiceName',
        kind: 'class',
      }),
    );
    expect(
      graph.nodes.find((n) => n.id === 'src/aliased-export.service.ts#PublicAlias'),
    ).toBeUndefined();
  });

  it('resolves a ClassSource by export identity, not by an unrelated declaration with the same name (レビュー再指摘6)', async () => {
    // 同一ファイルに、宣言名 'Foo' の(export されていない)クラスと、
    // `export { Bar as Foo }` で別名 'Foo' として再exportされた 'Bar' クラスが同居する。
    // ClassSource.exportName('Foo')は export identity であり、buildFakeDeps では
    // 表現できない(1ファイル1 classDecl 固定)ため、BuildGraphV3Deps を直接組み立てる
    const declarations: readonly ClassDeclarationInfo[] = [
      { name: 'Foo', loc: { start: 1, end: 2 }, decorators: [], exported: false },
      { name: 'Bar', exportName: 'Foo', loc: { start: 3, end: 4 }, decorators: [], exported: true },
    ];
    const deps: BuildGraphV3Deps = {
      resolveDependencies: () => okAsync({ kind: 'external' }),
      getFunctionDeclarations: () =>
        okAsync([
          {
            ref: { kind: 'method', filePath: 'src/ambiguous.ts', owner: 'Bar', name: 'run' },
            decorators: [],
            visibility: 'public',
            loc: { start: 3, end: 4 },
          },
        ]),
      getFunctionSignature: () => okAsync({ params: [], returnType: 'void' }),
      getCallSites: () => okAsync([]),
      getClassDeclarations: () => okAsync(declarations),
    };
    // root.className は宣言名(Bar)、root.source.exportName は export identity('Foo')
    const root: GraphRootV3 = { className: 'Bar', source: src('src/ambiguous.ts', 'Foo') };
    const graph = await graphOk(buildDependencyGraph([root], deps));

    // 'Foo' というただの宣言名一致にひきずられず、export identity 'Foo' の実体である
    // 'Bar' に正しく解決される
    expect(graph.nodes).toContainEqual(
      expect.objectContaining({ id: 'src/ambiguous.ts#Bar', kind: 'class', name: 'Bar' }),
    );
    expect(graph.nodes.find((n) => n.id === 'src/ambiguous.ts#Foo')).toBeUndefined();
  });

  it('functionRoots: enumerates a function root unreachable from any class, following its calls into the callee’s owner class (レビュー指摘2)', async () => {
    // zelt.config.ts の app factory(createEcApp)を模す。どの GraphRootV3(クラス起点)からも
    // 到達しない孤立した関数だが、functionRoots 経由で queue に積まれ、その呼び出し先の
    // owner クラス(AppService)も通常の internal 呼び出しと同様に seed される
    const files: FakeFile[] = [
      {
        filePath: 'src/zelt.config.ts',
        functions: [
          {
            name: 'createEcApp',
            calls: [
              {
                line: 5,
                target: {
                  kind: 'internal',
                  ref: {
                    kind: 'method',
                    filePath: 'src/app.service.ts',
                    owner: 'AppService',
                    name: 'init',
                  },
                },
              },
            ],
          },
        ],
      },
      { filePath: 'src/app.service.ts', functions: [{ name: 'init', owner: 'AppService' }] },
    ];
    const functionRoots: FunctionRef[] = [
      { kind: 'function', filePath: 'src/zelt.config.ts', name: 'createEcApp' },
    ];
    const graph = await graphOk(
      buildDependencyGraph([], buildFakeDeps(files, new Map()), functionRoots),
    );

    expect(graph.nodes.find((n) => n.id === 'src/zelt.config.ts#createEcApp')).toBeDefined();
    expect(graph.nodes).toContainEqual(
      expect.objectContaining({ id: 'src/app.service.ts#AppService', kind: 'class' }),
    );
    expect(graph.nodes.find((n) => n.id === 'src/app.service.ts#AppService.init')).toBeDefined();
    expect(graph.edges).toContainEqual({
      kind: 'calls',
      from: 'src/zelt.config.ts#createEcApp',
      to: 'src/app.service.ts#AppService.init',
      context: 'plain',
      awaited: false,
      line: 5,
    });
  });

  it('functionRoots: a function also reached by a call from a class method is enqueued once (no duplicate FnNode/edges, no DUPLICATE_NODE_ID)', async () => {
    const files: FakeFile[] = [
      {
        filePath: 'src/auth.controller.ts',
        functions: [
          {
            name: 'me',
            owner: 'AuthController',
            calls: [
              {
                line: 3,
                target: {
                  kind: 'internal',
                  ref: {
                    kind: 'function',
                    filePath: 'src/current-user.lib.ts',
                    name: 'requireUser',
                  },
                },
              },
            ],
          },
        ],
      },
      { filePath: 'src/current-user.lib.ts', functions: [{ name: 'requireUser' }] },
    ];
    const root: GraphRootV3 = {
      className: 'AuthController',
      source: src('src/auth.controller.ts', 'AuthController'),
    };
    // requireUser は AuthController.me からの呼び出しでも、functionRoots からも到達する。
    // scheduleFunction の enqueuedFunctions ガードにより1回しか queue に積まれないはず
    const functionRoots: FunctionRef[] = [
      { kind: 'function', filePath: 'src/current-user.lib.ts', name: 'requireUser' },
    ];
    const graph = await graphOk(
      buildDependencyGraph([root], buildFakeDeps(files, new Map()), functionRoots),
    );

    const requireUserNodes = graph.nodes.filter(
      (n) => n.id === 'src/current-user.lib.ts#requireUser',
    );
    expect(requireUserNodes).toHaveLength(1);
    const callsEdges = graph.edges.filter(
      (e) => e.kind === 'calls' && e.to === 'src/current-user.lib.ts#requireUser',
    );
    expect(callsEdges).toHaveLength(1);
  });
});
