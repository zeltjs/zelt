import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import ts from 'typescript';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { renderModels } from './render.lib';
import { readSchema } from './schema-adapter.lib';
import * as schema from './test/fixtures/global-names-schema';

const root = resolve(__dirname, '../../..');
let directory: string;
let generated: string;
let program: ts.Program;

beforeAll(async () => {
  await mkdir(resolve(root, '.tmp'), { recursive: true });
  directory = await mkdtemp(resolve(root, '.tmp/graphql-drizzle-globals-'));
  generated = resolve(directory, 'generated.ts');
  const result = readSchema(schema);
  if (result.kind === 'error') throw new Error(result.message);
  await writeFile(
    generated,
    renderModels(result.models, {
      schemaImport: relative(directory, resolve(__dirname, 'test/fixtures/global-names-schema')),
      databaseImport: relative(directory, resolve(__dirname, 'test/fixtures/database.service')),
      databaseExport: 'DrizzleService',
      source: 'generated.ts',
      header: '// generated',
    }),
  );
  program = ts.createProgram([generated], {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    baseUrl: root,
    ignoreDeprecations: '6.0',
    paths: {
      '@zeltjs/graphql': ['packages/graphql/src/index.ts'],
      '@zeltjs/core': ['packages/core/dist/index.d.ts'],
      '@zeltjs/graphql-drizzle': ['packages/graphql-drizzle/src/index.ts'],
      'drizzle-orm': ['packages/graphql-drizzle/node_modules/drizzle-orm'],
      'drizzle-orm/*': ['packages/graphql-drizzle/node_modules/drizzle-orm/*'],
    },
  });
}, 30_000);
afterAll(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});

// Member names (`.get`, `.for`) belong to their receiver; only names looked up in scope can be
// shadowed by a model, plus the members read off `globalThis` itself.
const isScopeReference = (node: ts.Identifier): boolean => {
  const { parent } = node;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node)
    return ts.isIdentifier(parent.expression) && parent.expression.text === 'globalThis';
  if (ts.isQualifiedName(parent) && parent.right === node)
    return ts.isIdentifier(parent.left) && parent.left.text === 'globalThis';
  return true;
};

const libraryGlobals = (): ReadonlySet<string> => {
  const checker = program.getTypeChecker();
  const file = program.getSourceFile(generated);
  const names = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && isScopeReference(node)) {
      const declarations = checker.getSymbolAtLocation(node)?.declarations ?? [];
      if (declarations.some((item) => program.isSourceFileDefaultLibrary(item.getSourceFile())))
        names.add(node.text);
    }
    ts.forEachChild(node, visit);
  };
  if (file) visit(file);
  return names;
};

it('type-checks when models are named after every global the generated module uses', () => {
  const diagnostics = ts
    .getPreEmitDiagnostics(program)
    .filter((diagnostic) => diagnostic.file?.fileName === generated)
    .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
  expect(diagnostics).toEqual([]);
  expect(program.getSourceFile(generated)?.text).toEqual(
    expect.stringContaining('type $hyphen$2d$atedRow = (typeof $schema)["hyphen-ated"]'),
  );
  expect(program.getSourceFile(generated)?.text).toContain('type $$24$dollarRow =');
  const models = new Set(
    Object.values(schema).flatMap((value) => {
      const result = readSchema({ value });
      return result.kind === 'success' ? result.models.map(({ name }) => name) : [];
    }),
  );
  // `String` is a reserved GraphQL type name, so no model can take it.
  const globals = [...libraryGlobals()];
  expect(globals).toEqual(expect.arrayContaining(['Pick', 'Promise', 'Map', 'String']));
  expect(globals.filter((name) => name !== 'String' && !models.has(name))).toEqual([]);
});
