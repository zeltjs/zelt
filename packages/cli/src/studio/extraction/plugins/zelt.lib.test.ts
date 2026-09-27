import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import type { CoreFacts, Material, ResolvedConfig } from '../core';
import { buildCoreFacts } from '../core';
import { analyzeZelt } from './zelt.lib';
import { blueprintMaterials } from './zelt-blueprint.lib';
import type { ZeltClassRef, ZeltInspection } from './zelt-inspect-protocol';

const ROOT = '/repo';

const CORE = `
const classDecorator = (props: unknown) => (target: unknown, context?: unknown) => {};
const methodDecorator = (props: unknown) => (target: unknown, context?: unknown) => {};

export const inject = <T>(cls: abstract new (...args: never[]) => T): T => ({}) as T;
export class LifecycleManager {
  register(target: unknown): void {}
}
export const Injectable = () => classDecorator({ decorator: 'Injectable' } as const);
export const Controller = (basePath: string) =>
  classDecorator({ decorator: 'Controller', basePath } as const);
export const Middleware = classDecorator({ decorator: 'Middleware' } as const);
export const Config = classDecorator({ decorator: 'Config' } as const);
export const Get = (path: string) =>
  methodDecorator({ decorator: 'Route', method: 'GET', path } as const);
export const Post = (path: string) =>
  methodDecorator({ decorator: 'Route', method: 'POST', path } as const);
export function UseMiddleware(middleware: unknown) {
  return methodDecorator({ decorator: 'UseMiddleware', middlewares: [middleware] } as const);
}
export const Authorized = (roles: string[] = []) =>
  methodDecorator({ decorator: 'Authorized', roles } as const);
export class CorsConfig {
  readonly origin: string[] = [];
}
export class CorsMiddleware {
  async use(next: () => Promise<void>): Promise<void> {
    await next();
  }
}
export class RateLimitMiddleware {
  static with(options: unknown): unknown {
    return options;
  }
  async use(next: () => Promise<void>): Promise<void> {
    await next();
  }
}
export const RateLimit = (options: unknown) => UseMiddleware(RateLimitMiddleware.with(options));
export const createApp = (features: unknown[], options?: unknown): unknown => [features, options];
export const http = (options: unknown): unknown => options;
`;

const EVENTBUS = `
export interface EventBusSchema extends Record<string, unknown> {}
export class MemoryEventBusAdaptor {
  async emit<K extends string & keyof EventBusSchema>(event: K, data: EventBusSchema[K]): Promise<void> {}
  async on<K extends string & keyof EventBusSchema>(
    event: K,
    handler: (data: EventBusSchema[K]) => void,
  ): Promise<() => void> {
    return () => {};
  }
}
export const eventbus = (options: unknown): unknown => options;
`;

const APP_FILES: Record<string, string> = {
  'app/events.ts': `
declare module '@zeltjs/eventbus' {
  interface EventBusSchema {
    'thing:made': { id: number };
  }
}
export {};
`,
  'app/thing.service.ts': `
import { Injectable, inject, LifecycleManager } from '@zeltjs/core';
import { MemoryEventBusAdaptor } from '@zeltjs/eventbus';
import './events';

@Injectable()
export class ThingService {
  constructor(
    private readonly bus = inject(MemoryEventBusAdaptor),
    lifecycle = inject(LifecycleManager),
  ) {
    lifecycle.register(this);
  }

  async make(): Promise<void> {
    await this.bus.emit('thing:made', { id: 1 });
  }
}
`,
  'app/thing.handlers.ts': `
import { Injectable, inject } from '@zeltjs/core';
import { MemoryEventBusAdaptor } from '@zeltjs/eventbus';
import './events';

@Injectable()
export class ThingHandlers {
  constructor(private readonly bus = inject(MemoryEventBusAdaptor)) {}

  async startup(): Promise<void> {
    await this.bus.on('thing:made', (data) => {
      void data;
    });
  }
}
`,
  'app/audit.middleware.ts': `
import { Middleware } from '@zeltjs/core';

@Middleware
export class AuditMiddleware {
  async use(next: () => Promise<void>): Promise<void> {
    await next();
  }
}
`,
  'app/thing.controller.ts': `
import {
  Authorized,
  Controller,
  Get,
  inject,
  Post,
  RateLimit,
  UseMiddleware,
} from '@zeltjs/core';
import { AuditMiddleware } from './audit.middleware';
import { ThingService } from './thing.service';

@UseMiddleware(AuditMiddleware)
@Controller('/api/things')
export class ThingController {
  constructor(private readonly things = inject(ThingService)) {}

  @Get('/')
  async list(): Promise<void> {}

  @Authorized(['admin'])
  @Get('/:id')
  async detail(): Promise<void> {}

  @RateLimit({ limit: 3 })
  @Post('/')
  async create(): Promise<void> {
    await this.things.make();
  }
}
`,
  'app/ec.config.ts': `
import { Config, CorsConfig } from '@zeltjs/core';

@Config
export class EcCorsConfig extends CorsConfig {
  override readonly origin = ['http://localhost'];
}
`,
  'app/app.ts': `
import { createApp, http } from '@zeltjs/core';
import { eventbus, MemoryEventBusAdaptor } from '@zeltjs/eventbus';
import { AuditMiddleware } from './audit.middleware';
import { EcCorsConfig } from './ec.config';
import { ThingController } from './thing.controller';
import { ThingHandlers } from './thing.handlers';

export const createTestApp = () =>
  createApp(
    [
      http({ controllers: [ThingController], middlewares: [AuditMiddleware] }),
      eventbus({ adaptor: MemoryEventBusAdaptor, handlers: [ThingHandlers] }),
    ],
    { configs: [EcCorsConfig] },
  );
`,
};

const sourceModules = {
  '@zeltjs/core': `${ROOT}/lib/core.ts`,
  '@zeltjs/eventbus': `${ROOT}/lib/eventbus.ts`,
};

const config: ResolvedConfig = {
  raw: {
    version: 1,
    project: { id: 'p', name: 'p' },
    root: '.',
    tsconfig: 'tsconfig.json',
    include: ['app/**/*.ts'],
    exclude: [],
    mapPackages: [
      {
        package: '@zeltjs/core',
        exports: ['CorsMiddleware', 'RateLimitMiddleware', 'CorsConfig'],
      },
      { package: '@zeltjs/eventbus', exports: ['MemoryEventBusAdaptor'] },
    ],
    ignore: [{ package: '@zeltjs/core', exports: ['LifecycleManager', 'inject'] }],
    sourceText: ['app/**'],
    sourceModules,
    plugins: [],
    presentation: { id: 'p', columns: [], rules: [], fallbackColumnId: 'column:other' },
    required: [],
    output: 'out.json',
  },
  configFile: `${ROOT}/x.extract.json`,
  root: ROOT,
  tsconfig: `${ROOT}/tsconfig.json`,
  output: `${ROOT}/out.json`,
  sourceModules,
  isIncluded: (path) => path.startsWith('app/'),
  isSourceTextAllowed: (path) => path.startsWith('app/'),
  columnIdFor: () => 'column:a',
};

const buildProgram = (): ts.Program => {
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
  };
  const files: Record<string, string> = {
    ...APP_FILES,
    'lib/core.ts': CORE,
    'lib/eventbus.ts': EVENTBUS,
  };
  const sources = new Map<string, ts.SourceFile>();
  for (const [name, text] of Object.entries(files)) {
    sources.set(
      `${ROOT}/${name}`,
      ts.createSourceFile(`${ROOT}/${name}`, text, ts.ScriptTarget.ES2022, true),
    );
  }
  const defaultHost = ts.createCompilerHost(options, true);
  const host: ts.CompilerHost = {
    ...defaultHost,
    getSourceFile: (fileName, languageVersion, onError, shouldCreate) =>
      sources.get(fileName) ??
      defaultHost.getSourceFile(fileName, languageVersion, onError, shouldCreate),
    fileExists: (fileName) => sources.has(fileName) || defaultHost.fileExists(fileName),
    readFile: (fileName) => sources.get(fileName)?.text ?? defaultHost.readFile(fileName),
    getCurrentDirectory: () => ROOT,
    // 相対 import の解決は directoryExists を通るので、実 FS に無い仮想 root を許す
    directoryExists: (name) => [...sources.keys()].some((file) => file.startsWith(`${name}/`)),
    realpath: (name) => name,
  };
  host.resolveModuleNameLiterals = (literals, containingFile, _redirected, compilerOptions) =>
    literals.map((literal) => {
      const mapped = Reflect.get(sourceModules, literal.text);
      if (typeof mapped === 'string') {
        return {
          resolvedModule: {
            resolvedFileName: mapped,
            extension: ts.Extension.Ts,
            isExternalLibraryImport: false,
          },
        };
      }
      return ts.resolveModuleName(literal.text, containingFile, compilerOptions, host);
    });
  return ts.createProgram({ rootNames: [...sources.keys()], options, host });
};

const nameOf = (facts: CoreFacts) => {
  const groups = new Map(facts.groups.map((group) => [group.id, group.name]));
  const declarations = new Map(facts.declarations.map((decl) => [decl.id, decl]));
  const labelOf = (decl: { readonly groupId: string; readonly name: string }): string => {
    const owner = groups.get(decl.groupId) ?? '';
    const kind = facts.groups.find((group_) => group_.id === decl.groupId)?.kind;
    return kind === 'file' ? decl.name : `${owner}.${decl.name}`;
  };
  const resolve = (id: string | null): string => {
    if (id === null) return '(none)';
    const group = groups.get(id);
    if (group !== undefined) return group;
    const decl = declarations.get(id);
    if (decl === undefined) return id;
    if (decl.enclosingDeclarationId !== null) {
      return `${resolve(decl.enclosingDeclarationId)}${decl.name}`;
    }
    return labelOf(decl);
  };
  return resolve;
};

// 子プロセスが返す所在は「root 相対 path と1始まりの行」だけ。fixture の原文から引く
const lineOf = (file: string, needle: string): number => {
  const text = APP_FILES[file] ?? '';
  return text.slice(0, text.indexOf(needle)).split('\n').length;
};

const fileRef = (filePath: string, exportName: string): ZeltClassRef => ({
  package: null,
  filePath,
  exportName,
});

const packageRef = (pkg: string, exportName: string): ZeltClassRef => ({
  package: pkg,
  filePath: '',
  exportName,
});

const CONTROLLER = fileRef('app/thing.controller.ts', 'ThingController');
const SERVICE = fileRef('app/thing.service.ts', 'ThingService');
const HANDLERS = fileRef('app/thing.handlers.ts', 'ThingHandlers');
const AUDIT = fileRef('app/audit.middleware.ts', 'AuditMiddleware');
const EC_CONFIG = fileRef('app/ec.config.ts', 'EcCorsConfig');
const CORS_CONFIG = packageRef('@zeltjs/core', 'CorsConfig');
const RATE_LIMIT = packageRef('@zeltjs/core', 'RateLimitMiddleware');
const BUS = packageRef('@zeltjs/eventbus', 'MemoryEventBusAdaptor');

/** ec-backend と同じ形で、fixture の app を読んだ子プロセスが返す JSON */
const inspection: ZeltInspection = {
  applicationId: 'test',
  factory: { filePath: 'app/app.ts', exportName: 'createTestApp' },
  registered: [CONTROLLER, BUS, HANDLERS, AUDIT, EC_CONFIG],
  globalMiddlewares: [AUDIT],
  classes: [
    {
      ref: CONTROLLER,
      decorators: ['UseMiddleware', 'Controller'],
      base: null,
      dependencies: [
        {
          target: SERVICE,
          localName: 'ThingService',
          line: lineOf('app/thing.controller.ts', 'inject(ThingService)'),
        },
      ],
      middlewares: [
        {
          target: AUDIT,
          on: { kind: 'class' },
          position: {
            filePath: 'app/thing.controller.ts',
            line: lineOf('app/thing.controller.ts', '@UseMiddleware(AuditMiddleware)'),
          },
        },
        {
          target: RATE_LIMIT,
          on: { kind: 'method', name: 'create' },
          position: {
            filePath: 'app/thing.controller.ts',
            line: lineOf('app/thing.controller.ts', '@RateLimit({ limit: 3 })'),
          },
        },
      ],
      authorized: [
        {
          methodName: 'detail',
          position: {
            filePath: 'app/thing.controller.ts',
            line: lineOf('app/thing.controller.ts', "@Authorized(['admin'])"),
          },
        },
      ],
    },
    {
      ref: SERVICE,
      decorators: ['Injectable'],
      base: null,
      dependencies: [
        {
          target: BUS,
          localName: 'MemoryEventBusAdaptor',
          line: lineOf('app/thing.service.ts', 'inject(MemoryEventBusAdaptor)'),
        },
        {
          target: packageRef('@zeltjs/core', 'LifecycleManager'),
          localName: 'LifecycleManager',
          line: lineOf('app/thing.service.ts', 'inject(LifecycleManager)'),
        },
      ],
      middlewares: [],
      authorized: [],
    },
    {
      ref: HANDLERS,
      decorators: ['Injectable'],
      base: null,
      dependencies: [
        {
          target: BUS,
          localName: 'MemoryEventBusAdaptor',
          line: lineOf('app/thing.handlers.ts', 'inject(MemoryEventBusAdaptor)'),
        },
      ],
      middlewares: [],
      authorized: [],
    },
    {
      ref: AUDIT,
      decorators: ['Middleware'],
      base: null,
      dependencies: [],
      middlewares: [],
      authorized: [],
    },
    {
      ref: EC_CONFIG,
      decorators: ['Config'],
      base: CORS_CONFIG,
      dependencies: [],
      middlewares: [],
      authorized: [],
    },
  ],
  routes: [
    { controller: CONTROLLER, methodName: 'list', method: 'GET', fullPath: '/api/things' },
    { controller: CONTROLLER, methodName: 'detail', method: 'GET', fullPath: '/api/things/:id' },
    { controller: CONTROLLER, methodName: 'create', method: 'POST', fullPath: '/api/things' },
  ],
  diagnostics: [],
};

const describeMaterial = (name: (id: string | null) => string, material: Material): string => {
  if (material.kind === 'relation') {
    return `relation ${material.relation} ${name(material.from)} -> ${name(material.to)}`;
  }
  if (material.kind === 'hint') return `hint ${name(material.subject)} :: ${material.label}`;
  if (material.kind === 'setup') {
    return `setup ${material.setup} ${name(material.subject)} :: ${material.label} -> ${name(material.target)}`;
  }
  if (material.kind === 'meaning') return `meaning ${material.meaning} ${name(material.subject)}`;
  if (material.kind === 'route') return `route ${material.method} ${material.path}`;
  if (material.kind === 'di') return `di ${material.value} ${name(material.subject)}`;
  return material.kind;
};

type Run = {
  readonly lines: readonly string[];
  readonly materials: readonly Material[];
};

/** 子プロセスを起動せず、その JSON を与えて材料だけを確かめる */
const runBlueprint = (): Run => {
  const program = buildProgram();
  const indexed = buildCoreFacts(program, config);
  const materials = blueprintMaterials({
    config,
    resolver: indexed.resolver,
    inspection,
    note: () => {},
  });
  const name = nameOf(indexed.resolver.facts());
  return { materials, lines: materials.map((m) => describeMaterial(name, m)) };
};

describe('blueprintMaterials', () => {
  it('annotates each route method with its full path', () => {
    const { lines } = runBlueprint();
    expect(lines.filter((line) => line.startsWith('hint') && line.includes(' :: GET'))).toEqual([
      'hint ThingController.list :: GET /api/things',
      'hint ThingController.detail :: GET /api/things/:id',
    ]);
    expect(lines).toContain('hint ThingController.create :: POST /api/things');
  });

  it('grants a middleware line from every route to the app, class and method middleware', () => {
    const { lines } = runBlueprint();
    expect(lines.filter((line) => line.startsWith('relation middleware')).sort()).toEqual([
      'relation middleware ThingController.create -> AuditMiddleware.use',
      'relation middleware ThingController.create -> AuditMiddleware.use',
      'relation middleware ThingController.create -> RateLimitMiddleware.use',
      'relation middleware ThingController.detail -> AuditMiddleware.use',
      'relation middleware ThingController.detail -> AuditMiddleware.use',
      'relation middleware ThingController.list -> AuditMiddleware.use',
      'relation middleware ThingController.list -> AuditMiddleware.use',
    ]);
  });

  it('orders the chain as router, controller and method register it', () => {
    const { materials } = runBlueprint();
    const orders = materials.flatMap((material) =>
      material.kind === 'relation' && material.relation === 'middleware' ? [material.order] : [],
    );
    // list / detail は app(0) → class(1)、create はそのあとに method(2)
    expect(orders).toEqual([0, 1, 0, 1, 0, 1, 2]);
  });

  it('leaves the middleware core registers on its own out of the map', () => {
    const { lines } = runBlueprint();
    expect(lines.filter((line) => line.includes('CorsMiddleware'))).toEqual([]);
  });

  it('keeps @Authorized as setup only, with no middleware class and no line', () => {
    const { lines } = runBlueprint();
    expect(lines).toContain(
      "setup middleware ThingController.detail :: @Authorized(['admin']) -> (none)",
    );
    expect(lines.filter((line) => line.includes('-> Authorized'))).toEqual([]);
  });

  it('labels a decorator that wraps UseMiddleware with what the code says', () => {
    const { lines } = runBlueprint();
    expect(lines).toContain(
      'setup middleware ThingController.create :: @RateLimit({ limit: 3 }) -> RateLimitMiddleware',
    );
  });

  it('grants a register line from the app factory to every registered class', () => {
    const { lines } = runBlueprint();
    expect(lines.filter((line) => line.startsWith('relation register')).sort()).toEqual([
      'relation register createTestApp -> AuditMiddleware',
      'relation register createTestApp -> EcCorsConfig',
      'relation register createTestApp -> MemoryEventBusAdaptor',
      'relation register createTestApp -> ThingController',
      'relation register createTestApp -> ThingHandlers',
    ]);
  });

  it('turns inject defaults and Config subclassing into setup', () => {
    const { lines } = runBlueprint();
    expect(lines).toContain(
      'setup inject ThingService.constructor :: inject(MemoryEventBusAdaptor) -> MemoryEventBusAdaptor',
    );
    // ignore したものへの target は null。setup は残る
    expect(lines).toContain(
      'setup inject ThingService.constructor :: inject(LifecycleManager) -> (none)',
    );
    expect(lines).toContain(
      'setup config-override EcCorsConfig :: @Config extends CorsConfig -> CorsConfig',
    );
  });

  it('points the evidence of a register line at the registration in the app factory', () => {
    const { materials } = runBlueprint();
    const register = materials.find(
      (material) => material.kind === 'relation' && material.relation === 'register',
    );
    expect(register?.kind === 'relation' ? register.evidence[0]?.span.filePath : null).toBe(
      'app/app.ts',
    );
  });

  it('marks every injectable constructor with the DI hint', () => {
    const { lines } = runBlueprint();
    expect(lines.filter((line) => line.endsWith(':: DI / 初期化')).sort()).toEqual([
      'hint ThingController.constructor :: DI / 初期化',
      'hint ThingHandlers.constructor :: DI / 初期化',
      'hint ThingService.constructor :: DI / 初期化',
    ]);
  });

  it('leaves library classes to the boundary box, with no DI meaning of their own', () => {
    const { lines } = runBlueprint();
    expect(lines.filter((line) => line.startsWith('di '))).toHaveLength(5);
    expect(lines.filter((line) => line.includes('CorsMiddleware :: DI'))).toEqual([]);
  });
});

/** 子プロセスを使わない feature(event・lifecycle)は application 無しで確かめる */
const runWithoutApplication = async (): Promise<Run> => {
  const program = buildProgram();
  const indexed = buildCoreFacts(program, config);
  const result = await analyzeZelt({
    program,
    checker: program.getTypeChecker(),
    config,
    resolver: indexed.resolver,
    applications: [],
    entryPath: '/no/such/entry.ts',
    timeoutMs: 1000,
    testScopes: [],
    setupDetails: false,
    revision: 'rev',
  });
  const name = nameOf(indexed.resolver.facts());
  return {
    materials: result.materials,
    lines: result.materials.map((m) => describeMaterial(name, m)),
  };
};

describe('analyzeZelt', () => {
  it('connects emit to the subscribing callback and keeps the read line as a meaning', async () => {
    const { lines } = await runWithoutApplication();
    expect(lines).toContain('relation event ThingService.make -> ThingHandlers.startup@callback:0');
    expect(lines).toContain('hint ThingHandlers.startup@callback:0 :: EVENT thing:made');
    expect(lines.filter((line) => line.startsWith('meaning register'))).toHaveLength(1);
    expect(lines).toContain('meaning event-type thing:made');
  });

  it('keeps the lifecycle registration as setup', async () => {
    const { lines } = await runWithoutApplication();
    expect(lines).toContain(
      'setup lifecycle ThingService.constructor :: lifecycle.register(this) -> (none)',
    );
  });

  it('reports every declared feature and suggests the exports to ignore', async () => {
    const program = buildProgram();
    const indexed = buildCoreFacts(program, config);
    const result = await analyzeZelt({
      program,
      checker: program.getTypeChecker(),
      config,
      resolver: indexed.resolver,
      applications: [],
      entryPath: '/no/such/entry.ts',
      timeoutMs: 1000,
      testScopes: [],
      setupDetails: false,
      revision: 'rev',
    });
    expect(result.reports.map((report) => `${report.feature}:${report.status}`).sort()).toEqual([
      'di:complete-in-scope',
      'hints:complete-in-scope',
      'meanings:complete-in-scope',
      'relations:complete-in-scope',
      'routes:complete-in-scope',
      'setup:complete-in-scope',
      // setupDetails を切ったので、Unit の setup は未取得のまま返る(付録H)
      'test-setups:uncollected',
    ]);
    expect(result.ignoreRecommendations.flatMap((entry) => entry.exports)).toContain('inject');
  });

  it('turns a child process failure into a partial report so nothing is published', async () => {
    const program = buildProgram();
    const indexed = buildCoreFacts(program, config);
    const result = await analyzeZelt({
      program,
      checker: program.getTypeChecker(),
      config,
      resolver: indexed.resolver,
      applications: [
        { id: 'test', factory: { filePath: 'app/app.ts', exportName: 'createTestApp' } },
      ],
      entryPath: '/no/such/entry.ts',
      timeoutMs: 5000,
      testScopes: [],
      setupDetails: false,
      revision: 'rev',
    });
    expect(
      result.reports.filter((report) => report.feature !== 'test-setups').map((r) => r.status),
    ).toEqual(['partial', 'partial', 'partial', 'partial', 'partial', 'partial']);
  });
});
