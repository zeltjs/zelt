import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import type {
  ApplicationContribution,
  PluginResult,
  RequestContribution,
  ResolvedConfig,
} from '../core';
import { buildCoreFacts } from '../core';
import { analyzeHttpRequests } from './http-requests.lib';

const ROOT = '/repo';

const CORE = `
export class HttpFeature {
  async request(url: string, init?: RequestInit): Promise<Response> {
    return new Response();
  }
}
export type App = { http: HttpFeature };
export const createApp = (): App => ({ http: new HttpFeature() });
`;

const FILES: Record<string, string> = {
  'e2e/helpers/setup.ts': `
import { createApp } from '@zeltjs/core';
import type { App } from '@zeltjs/core';

export const createTestApp = async (): Promise<App> => createApp();

export const authRequest = (app: App, token: string, method: string, path: string, body?: unknown) =>
  app.http.request(path, { method, headers: { Authorization: token } });

export const seedAdmin = async (app: App): Promise<string> => {
  await authRequest(app, 't', 'POST', '/api/seed');
  await authRequest(app, 't', 'POST', '/api/login');
  return 't';
};
`,
  'e2e/product.spec.ts': `
import { beforeAll, describe, it } from 'vitest';
import type { App } from '@zeltjs/core';
import { authRequest, createTestApp, seedAdmin } from './helpers/setup';

describe('Product API', () => {
  let testApp: App;
  let token: string;

  beforeAll(async () => {
    testApp = await createTestApp();
    token = await seedAdmin(testApp);
  });

  const createProduct = (data: Record<string, unknown>) =>
    authRequest(testApp, token, 'POST', '/api/products', data);

  it('lists products', async () => {
    await testApp.http.request('/api/products?page=2');
  });

  it('creates and reads a product', async () => {
    const created = await createProduct({ name: 'x' });
    await testApp.http.request(\`/api/products/\${created.status}\`);
  });
});
`,
};

const sourceModules = { '@zeltjs/core': `${ROOT}/lib/core.ts` };

const config: ResolvedConfig = {
  raw: {
    version: 1,
    project: { id: 'p', name: 'p' },
    root: '.',
    tsconfig: 'tsconfig.json',
    include: ['app/**/*.ts'],
    exclude: [],
    mapPackages: [],
    ignore: [],
    sourceText: ['**'],
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
  isSourceTextAllowed: () => true,
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
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
  };
  const sources = new Map<string, ts.SourceFile>();
  for (const [name, text] of Object.entries({ ...FILES, 'lib/core.ts': CORE })) {
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

const run = (): PluginResult => {
  const program = buildProgram();
  const indexed = buildCoreFacts(program, config);
  return analyzeHttpRequests({
    program,
    checker: program.getTypeChecker(),
    config,
    resolver: indexed.resolver,
    scopes: [{ files: ['e2e/product.spec.ts'], category: 'e2e' }],
    applications: [
      {
        id: 'ec',
        factory: { filePath: 'e2e/helpers/setup.ts', exportName: 'createTestApp' },
        resultPath: [],
      },
    ],
    helpers: [
      {
        function: { filePath: 'e2e/helpers/setup.ts', exportName: 'authRequest' },
        applicationArgument: 0,
        method: { kind: 'argument', index: 2 },
        path: { kind: 'argument', index: 3 },
      },
    ],
    revision: 'rev',
  });
};

const requestsOf = (result: PluginResult): readonly RequestContribution[] =>
  result.materials.flatMap((material) => (material.kind === 'request' ? [material.value] : []));

const applicationsOf = (result: PluginResult): readonly ApplicationContribution[] =>
  result.materials.flatMap((material) => (material.kind === 'application' ? [material.value] : []));

describe('analyzeHttpRequests', () => {
  it('reads direct requests, dropping the query string', () => {
    const direct = requestsOf(run()).filter((request) => request.via === 'direct');
    expect(direct.map((request) => `${request.method} ${request.path}`)).toEqual([
      'GET /api/products',
      'GET /api/products/${}',
    ]);
  });

  it('expands a declared helper and a local helper into one request each', () => {
    const helpers = requestsOf(run()).filter((request) => request.via === 'helper');
    expect(helpers.map((request) => `${request.method} ${request.path}`)).toEqual([
      'POST /api/products',
    ]);
  });

  it('resolves the app of every request to the configured factory call', () => {
    const result = run();
    const [application] = applicationsOf(result);
    expect(application?.applicationId).toBe('ec');
    for (const request of requestsOf(result)) {
      expect(request.application).toEqual({
        kind: 'factory-result',
        factoryCall: application?.factoryCall,
        path: [],
      });
    }
  });

  it('marks the scope partial when a helper it cannot expand sends requests', () => {
    const report = run().reports.find((item) => item.feature === 'e2e-associations');
    expect(report?.status).toBe('partial');
    expect(report?.diagnostics[0]?.code).toBe('http-unsupported-request-path');
  });
});
