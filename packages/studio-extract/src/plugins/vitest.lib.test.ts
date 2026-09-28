import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import type { ResolvedConfig, TestContribution } from '../core';
import { buildCoreFacts } from '../core';
import { analyzeVitest } from './vitest.lib';

const ROOT = '/repo';

const FILES: Record<string, string> = {
  'app/thing.service.ts': `
export class ThingService {
  get label(): string {
    return 'thing';
  }
  make(value: number): number {
    return value;
  }
}
export const helper = (value: number): number => value;
`,
  'app/factory.ts': `
import { ThingService } from './thing.service';
export const createTestTarget = <T>(cls: abstract new (...args: never[]) => T) => ({
  target: {} as T,
  get: async <U>(other: abstract new (...args: never[]) => U): Promise<U> => ({}) as U,
});
export type Thing = ThingService;
`,
  'app/thing.service.test.ts': `
import { beforeEach, describe, it } from 'vitest';
import { createTestTarget } from './factory';
import { ThingService } from './thing.service';
import { helper } from './thing.service';

describe('ThingService', () => {
  let target: { target: ThingService; get: <U>(cls: abstract new (...args: never[]) => U) => Promise<U> };
  let service: ThingService;

  beforeEach(async () => {
    target = createTestTarget(ThingService);
    service = target.target;
  });

  describe('make', () => {
    it('returns the value', () => {
      service.make(1);
    });

    it.skip('reads the label', () => {
      const read = service.label;
      void read;
    });
  });

  it('calls a module function', () => {
    helper(2);
  });
});
`,
};

const sourceModules = {};

const config: ResolvedConfig = {
  raw: {
    version: 1,
    project: { id: 'p', name: 'p' },
    root: '.',
    tsconfig: 'tsconfig.json',
    include: ['app/**/*.ts'],
    exclude: ['**/*.test.ts'],
    mapPackages: [],
    ignore: [],
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
  isIncluded: (path) => path.startsWith('app/') && !path.endsWith('.test.ts'),
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
  };
  const sources = new Map<string, ts.SourceFile>();
  for (const [name, text] of Object.entries(FILES)) {
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
  return ts.createProgram({ rootNames: [...sources.keys()], options, host });
};

const run = (): readonly TestContribution[] => {
  const program = buildProgram();
  const indexed = buildCoreFacts(program, config);
  const result = analyzeVitest({
    program,
    checker: program.getTypeChecker(),
    config,
    resolver: indexed.resolver,
    scopes: [{ files: ['app/**/*.test.ts'], category: 'unit' }],
    globals: false,
    revision: 'rev',
  });
  expect(result.reports.every((report) => report.status === 'complete-in-scope')).toBe(true);
  return result.materials.flatMap((material) => (material.kind === 'test' ? [material.value] : []));
};

describe('analyzeVitest', () => {
  it('registers a case per it() with its suite stack', () => {
    const cases = run();
    expect(cases.map((item) => [item.name, item.suite.join(' > '), item.mode])).toEqual([
      ['returns the value', 'ThingService > make', 'normal'],
      ['reads the label', 'ThingService > make', 'skip'],
      ['calls a module function', 'ThingService', 'normal'],
    ]);
    expect(cases[0]?.registration).toBe('app/thing.service.test.ts:17');
  });

  it('traces a receiver back to the factory call that produced it', () => {
    const [make] = run();
    const call = make?.calls[0];
    expect(call).toBeDefined();
    if (call === undefined) return;
    expect(call.ownerClass).toEqual({ filePath: 'app/thing.service.ts', name: 'ThingService' });
    const origin = call.origin;
    expect(origin?.kind).toBe('factory-result');
    if (origin?.kind === 'factory-result') expect(origin.path).toEqual(['target']);
  });

  it('counts a getter read as a direct call', () => {
    const label = run()[1]?.calls ?? [];
    expect(label).toHaveLength(1);
    expect(label[0]?.invocation.startLine).toBe(22);
  });

  it('leaves a call without a receiver unbound to any setup', () => {
    const moduleCall = run()[2]?.calls ?? [];
    expect(moduleCall).toHaveLength(1);
    expect(moduleCall[0]?.origin).toBeNull();
  });

  it('collects nothing when no scope is configured', () => {
    const program = buildProgram();
    const indexed = buildCoreFacts(program, config);
    const result = analyzeVitest({
      program,
      checker: program.getTypeChecker(),
      config,
      resolver: indexed.resolver,
      scopes: [],
      globals: false,
      revision: 'rev',
    });
    expect(result.materials).toEqual([]);
    expect(result.reports).toEqual([]);
  });
});
