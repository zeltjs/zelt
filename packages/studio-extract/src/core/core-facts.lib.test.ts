import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { buildCoreFacts } from './core-facts.lib';
import type { CoreFacts } from './core-facts.types';
import type { ResolvedConfig } from './extract-config.lib';

const ROOT = '/repo';

const configFor = (overrides: Partial<ResolvedConfig> = {}): ResolvedConfig => ({
  raw: {
    version: 1,
    project: { id: 'p', name: 'p' },
    root: '.',
    tsconfig: 'tsconfig.json',
    include: ['app/**/*.ts'],
    exclude: [],
    mapPackages: [],
    ignore: [],
    sourceText: ['app/**'],
    sourceModules: {},
    plugins: [],
    presentation: { id: 'p', columns: [], rules: [], fallbackColumnId: 'column:other' },
    required: [],
    output: 'out.json',
  },
  configFile: `${ROOT}/x.extract.json`,
  root: ROOT,
  tsconfig: `${ROOT}/tsconfig.json`,
  output: `${ROOT}/out.json`,
  sourceModules: {},
  isIncluded: (path) => path.startsWith('app/'),
  isSourceTextAllowed: (path) => path.startsWith('app/'),
  columnIdFor: () => 'column:a',
  ...overrides,
});

const buildFacts = (
  files: Record<string, string>,
  overrides: Partial<ResolvedConfig> = {},
): CoreFacts => {
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
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
  };
  const program = ts.createProgram({ rootNames: [...sources.keys()], options, host });
  return buildCoreFacts(program, configFor(overrides));
};

const named = (facts: CoreFacts) => {
  const groupName = new Map(facts.groups.map((g) => [g.id, g.name]));
  const declName = new Map<string, string>();
  const resolve = (id: string): string => {
    const group = groupName.get(id);
    if (group !== undefined) return group;
    return declName.get(id) ?? id;
  };
  for (const decl of facts.declarations) {
    const group = facts.groups.find((g) => g.id === decl.groupId);
    const prefix = group === undefined || group.kind === 'file' ? '' : `${group.name}.`;
    declName.set(decl.id, `${prefix}${decl.name}`);
  }
  // callbacks name themselves against their enclosing declaration
  for (const decl of facts.declarations) {
    if (decl.enclosingDeclarationId === null) continue;
    declName.set(decl.id, `${declName.get(decl.enclosingDeclarationId) ?? '?'}${decl.name}`);
  }
  return {
    groups: facts.groups.map((g) => `${g.kind}:${g.name}:${g.expansion}`).sort(),
    declarations: facts.declarations.map((d) => `${resolve(d.id)}:${d.kind}`).sort(),
    relations: facts.relations
      .map((r) => `${resolve(r.ownerId)} -${r.kind}-> ${resolve(r.to)}`)
      .sort(),
    facts,
    resolve,
  };
};

describe('buildCoreFacts', () => {
  it('splits classes into their own group and puts the rest in the file group', () => {
    const out = named(
      buildFacts({
        'app/a.ts': `
export class Service {
  run(): void {}
}
export type Id = string;
export const LIMIT = 3;
`,
      }),
    );
    expect(out.groups).toEqual(['class:Service:included', 'file:a.ts:included']);
    expect(out.declarations).toEqual(['Id:type', 'LIMIT:value', 'Service.run:method']);
  });

  it('draws call and read lines, and does not duplicate the callee as a read', () => {
    const out = named(
      buildFacts({
        'app/a.ts': `
export const LIMIT = 3;
export class Service {
  private readonly total = 0;
  run(): number {
    this.helper();
    return this.total + LIMIT;
  }
  helper(): void {}
}
`,
      }),
    );
    expect(out.relations).toEqual([
      'Service.run -call-> Service.helper',
      'Service.run -read-> LIMIT',
      'Service.run -read-> Service.total',
    ]);
  });

  it('reads a property through an intermediate receiver even when the call leaves the map', () => {
    const out = named(
      buildFacts({
        'app/a.ts': `
export class Db {
  readonly handle = { select: (): string[] => [], from: (x: string[]): string[] => x };
}
export const rows: string[] = [];
export class Service {
  constructor(private readonly db: Db) {}
  run(): string[] {
    return this.db.handle.from(rows);
  }
}
`,
      }),
    );
    expect(out.relations).toContain('Service.run -read-> Db.handle');
    expect(out.relations).toContain('Service.run -read-> rows');
  });

  it('marks a call into an interface member as contract', () => {
    const out = named(
      buildFacts({
        'app/a.ts': `
export interface Store {
  get(key: string): string | undefined;
}
export class Service {
  constructor(private readonly store: Store) {}
  run(): string | undefined {
    return this.store.get('k');
  }
}
`,
      }),
    );
    expect(out.relations).toContain('Service.run -contract-> Store.get');
  });

  it('makes each nested function its own callback declaration and reads the ones passed as arguments', () => {
    const out = named(
      buildFacts({
        'app/a.ts': `
export class Service {
  run(items: number[]): number[] {
    return items.map((n) => n + 1);
  }
  factory(): () => number {
    return () => 1;
  }
}
`,
      }),
    );
    expect(out.declarations).toContain('Service.run@callback:0:callback');
    expect(out.declarations).toContain('Service.factory@callback:0:callback');
    expect(out.relations).toContain('Service.run -read-> Service.run@callback:0');
    // 返した関数は包含で表すので線にしない
    expect(out.relations).not.toContain('Service.factory -read-> Service.factory@callback:0');
  });

  it('draws type lines for annotations and type assertions but not for a write', () => {
    const out = named(
      buildFacts({
        'app/a.ts': `
export type User = { id: number };
export class Service {
  current: User | undefined;
  run(input: unknown): User {
    this.current = input as User;
    return this.current;
  }
}
`,
      }),
    );
    expect(out.relations).toContain('Service.run -type-> User');
    expect(out.relations).toContain('Service.current -type-> User');
    // 代入の左辺は読みに数えない
    expect(out.relations.filter((r) => r === 'Service.run -read-> Service.current')).toHaveLength(
      1,
    );
  });

  it('puts extends and implements on the group and override on the member', () => {
    const out = named(
      buildFacts({
        'app/a.ts': `
export interface Runnable { run(): void }
export class Base {
  get name(): string { return 'base'; }
}
export class Child extends Base implements Runnable {
  override get name(): string { return 'child'; }
  run(): void {}
}
`,
      }),
    );
    expect(out.relations).toContain('Child -extends-> Base');
    expect(out.relations).toContain('Child -implements-> Runnable');
    expect(out.relations).toContain('Child.name -override-> Base.name');
  });

  it('does not draw a line for a class passed as a value or for a decorator expression', () => {
    const out = named(
      buildFacts({
        'app/a.ts': `
export const register = (target: unknown): unknown => target;
export class Dep {}
export class Service {
  constructor(private readonly dep = inject(Dep)) {}
}
export const inject = <T>(cls: new () => T): T => new cls();
`,
      }),
    );
    expect(out.relations).not.toContain('Service.constructor -read-> Dep');
    expect(out.relations).not.toContain('Service.constructor -construct-> Dep');
  });

  it('hides the source text of files the config does not allow', () => {
    const facts = buildFacts(
      { 'app/a.ts': 'export const secret = 1;\n' },
      { isSourceTextAllowed: () => false },
    );
    expect(facts.declarations[0]?.source.excerpt.kind).toBe('declaration-only');
    expect(facts.declarations[0]?.source.signature).toBe('secret');
  });

  it('collects the same relation twice as two pieces of evidence, not two relations', () => {
    const facts = buildFacts({
      'app/a.ts': `
export const LIMIT = 1;
export class Service {
  run(): number {
    return LIMIT + LIMIT + 1;
  }
  other(): number {
    return LIMIT;
  }
}
`,
    });
    const reads = facts.relations.filter((r) => r.kind === 'read');
    expect(reads).toHaveLength(2);
    expect(reads.find((r) => r.evidence.length === 1)).toBeDefined();
  });

  it('draws a type line to the member a literal type argument resolves to', () => {
    const out = named(
      buildFacts({
        'app/a.ts': `
export interface Schema {
  'thing:made': { id: number };
  'thing:gone': { id: number };
}
export class Bus {
  emit<K extends string & keyof Schema>(event: K, data: Schema[K]): void {}
  on<K extends string & keyof Schema>(event: K, handler: (data: Schema[K]) => void): void {}
}
export class Service {
  constructor(private readonly bus: Bus) {}
  make(): void {
    this.bus.emit('thing:made', { id: 1 });
  }
  listen(): void {
    this.bus.on('thing:gone', (data) => {
      void data;
    });
  }
}
`,
      }),
    );
    expect(out.relations).toContain('Service.make -type-> Schema.thing:made');
    expect(out.relations).toContain('Service.listen@callback:0 -type-> Schema.thing:gone');
    expect(out.relations).not.toContain('Service.listen -type-> Schema.thing:gone');
    const line = out.facts.relations.find((r) => r.kind === 'type' && r.to.includes('thing:made'));
    // 呼出側に型の字面が無いので、根拠は解決先の member 名
    expect(line?.evidence[0]?.expression).toBe("'thing:made'");
  });
});
