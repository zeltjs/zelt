import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import type { CoreFacts, Material, ResolvedConfig } from '../core';
import { buildCoreFacts, relationIdOf } from '../core';
import { analyzeDrizzle } from './drizzle.lib';
import type { LibraryInput } from './library.lib';
import { analyzeValibot } from './valibot.lib';

const ROOT = '/repo';

const VALIBOT = `
export interface BaseSchema<TOutput> {
  readonly kind: 'schema';
  readonly '~types': TOutput | undefined;
}
export interface ObjectSchema<TEntries> extends BaseSchema<TEntries> {
  readonly type: 'object';
  readonly entries: TEntries;
}
export interface StringSchema extends BaseSchema<string> {
  readonly type: 'string';
}
export declare function object<TEntries>(entries: TEntries): ObjectSchema<TEntries>;
export declare function string(): StringSchema;
export declare function getDotPath(issue: unknown): string | null;
export type InferOutput<TSchema> = TSchema extends BaseSchema<infer TOutput> ? TOutput : never;
`;

const DRIZZLE = `
export declare class Table {
  readonly _: { readonly name: string };
  readonly $inferSelect: unknown;
  readonly $inferInsert: unknown;
}
`;

const DRIZZLE_SQLITE = `
import { Table } from 'drizzle-orm';
export declare class SQLiteTable extends Table {}
export declare function sqliteTable<TColumns>(name: string, columns: TColumns): SQLiteTable & TColumns;
export declare function integer(name: string): number;
export declare function text(name: string): string;
`;

const APP_FILES: Record<string, string> = {
  'app/auth.schema.ts': `
import * as v from 'valibot';

const makeThing = (): { name: string } => ({ name: 'x' });

export const RegisterSchema = v.object({ email: v.string() });
export const dotPath = v.getDotPath({});
export const LooksLikeASchema = makeThing();
export type RegisterInput = v.InferOutput<typeof RegisterSchema>;
`,
  'app/db.schema.ts': `
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id'),
  email: text('email'),
});
export const columnCount = integer('id');
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
`,
  'app/user.service.ts': `
import { RegisterSchema } from './auth.schema';
import { users } from './db.schema';

export class UserService {
  register(): void {
    void RegisterSchema;
    void users;
  }
}
`,
};

const sourceModules = {
  valibot: `${ROOT}/lib/valibot.ts`,
  'drizzle-orm': `${ROOT}/lib/drizzle.ts`,
  'drizzle-orm/sqlite-core': `${ROOT}/lib/drizzle-sqlite.ts`,
};

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
    sourceText: ['app/**'],
    sourceModules,
    plugins: [{ id: 'valibot' }, { id: 'drizzle' }],
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
    'lib/valibot.ts': VALIBOT,
    'lib/drizzle.ts': DRIZZLE,
    'lib/drizzle-sqlite.ts': DRIZZLE_SQLITE,
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
  const groups = new Map(facts.groups.map((group) => [group.id, group]));
  const declarations = new Map(facts.declarations.map((decl) => [decl.id, decl]));
  const labelOf = (decl: { readonly groupId: string; readonly name: string }): string => {
    const group = groups.get(decl.groupId);
    return group?.kind === 'file' ? decl.name : `${group?.name ?? '?'}.${decl.name}`;
  };
  return (id: string): string => {
    const decl = declarations.get(id);
    return decl === undefined ? (groups.get(id)?.name ?? id) : labelOf(decl);
  };
};

type Analysed = {
  readonly facts: CoreFacts;
  readonly materials: readonly Material[];
  readonly name: (id: string) => string;
  readonly reports: ReturnType<typeof analyzeValibot>['reports'];
};

const analyse = (run: (input: LibraryInput) => ReturnType<typeof analyzeValibot>): Analysed => {
  const program = buildProgram();
  const facts = buildCoreFacts(program, config);
  const result = run({
    program,
    checker: program.getTypeChecker(),
    config,
    resolver: facts.resolver,
    revision: 'r1',
  });
  return {
    facts: facts.resolver.facts(),
    materials: result.materials,
    name: nameOf(facts.resolver.facts()),
    reports: result.reports,
  };
};

const meanings = (out: Analysed): string[] =>
  out.materials.flatMap((material) =>
    material.kind === 'meaning' ? [`${out.name(material.subject)} :: ${material.meaning}`] : [],
  );

const hints = (out: Analysed): string[] =>
  out.materials.flatMap((material) =>
    material.kind === 'hint' ? [`${out.name(material.subject)} :: ${material.label}`] : [],
  );

const readMeaningOn = (out: Analysed, owner: string, target: string): Material | undefined => {
  const relation = out.facts.relations.find(
    (item) =>
      item.kind === 'read' && out.name(item.ownerId) === owner && out.name(item.to) === target,
  );
  if (relation === undefined) return undefined;
  const id = relationIdOf(relation.ownerId, relation.to, 'read');
  return out.materials.find((material) => material.kind === 'meaning' && material.subject === id);
};

describe('analyzeValibot', () => {
  it('marks only the declarations whose initializer resolves to a valibot schema', () => {
    const out = analyse(analyzeValibot);
    expect(meanings(out)).toContain('RegisterSchema :: schema');
    // valibot の export を呼んでいても schema でないもの、名前が似ているだけのものは付けない
    expect(meanings(out)).not.toContain('dotPath :: schema');
    expect(meanings(out)).not.toContain('LooksLikeASchema :: schema');
  });

  it('adds the same meaning to the core read line without changing its kind', () => {
    const out = analyse(analyzeValibot);
    const material = readMeaningOn(out, 'UserService.register', 'RegisterSchema');
    expect(material).toMatchObject({ kind: 'meaning', meaning: 'schema' });
  });

  it('hints the type built from InferOutput with the schema it infers', () => {
    const out = analyse(analyzeValibot);
    expect(hints(out)).toEqual(['RegisterInput :: InferOutput<RegisterSchema>']);
  });

  it('reports every declared feature as complete when nothing is left unresolved', () => {
    const out = analyse(analyzeValibot);
    expect(out.reports.map((report) => `${report.feature}:${report.status}`)).toEqual([
      'meanings:complete-in-scope',
      'hints:complete-in-scope',
    ]);
  });
});

describe('analyzeDrizzle', () => {
  it('marks the table declaration and hints its table name', () => {
    const out = analyse(analyzeDrizzle);
    expect(meanings(out)).toContain('users :: table');
    expect(meanings(out)).not.toContain('columnCount :: table');
    expect(hints(out)).toContain('users :: users');
  });

  it('adds the table meaning to the core read line', () => {
    const out = analyse(analyzeDrizzle);
    const material = readMeaningOn(out, 'UserService.register', 'users');
    expect(material).toMatchObject({ kind: 'meaning', meaning: 'table' });
  });

  it('hints the types built from the inferred members of a table', () => {
    const out = analyse(analyzeDrizzle);
    expect(hints(out)).toContain('User :: DB schema由来');
    expect(hints(out)).toContain('NewUser :: DB schema由来');
  });
});
