import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import ts from 'typescript';
import { afterAll, beforeAll, expect, it } from 'vitest';
import 'drizzle-metadata/register';
import './metadata';
import { renderModels } from './render.lib';
import { readSchema } from './schema-adapter.lib';

const root = resolve(__dirname, '../../..');
let directory: string;

beforeAll(async () => {
  await mkdir(resolve(root, '.tmp'), { recursive: true });
  directory = await mkdtemp(resolve(root, '.tmp/graphql-drizzle-model-names-'));
});
afterAll(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});

// Every TypeScript keyword, plus the identifiers TypeScript refuses as type names (TS2427) or
// restricts in strict code, taken from the compiler rather than from a hand-written list.
const candidates = (): readonly string[] => {
  const keywords: string[] = [];
  for (let kind = ts.SyntaxKind.FirstKeyword; kind <= ts.SyntaxKind.LastKeyword; kind++) {
    const keyword = ts.tokenToString(kind);
    if (keyword) keywords.push(keyword);
  }
  return [...new Set([...keywords, 'undefined', 'arguments', 'eval'])];
};

const specifier = (from: string, to: string): string => {
  const path = relative(from, to).replaceAll('\\', '/');
  return path.startsWith('.') ? path : `./${path}`;
};

// The model is referenced as a relation target both singly and as an array, besides its own
// declaration and resolver. Written as source so the generated `typeof` lookups can see it.
const schemaSource = (name: string): string =>
  [
    `import { relations } from 'drizzle-orm';`,
    `import { sqliteTable, text } from 'drizzle-orm/sqlite-core';`,
    `import 'drizzle-metadata/register';`,
    `import '${specifier(directory, resolve(__dirname, 'metadata'))}';`,
    `export const model = sqliteTable('model', { id: text().primaryKey(), hubId: text('hub_id') }).meta({ graphqlName: ${JSON.stringify(name)} });`,
    `export const hub = sqliteTable('hub', { id: text().primaryKey(), modelId: text('model_id') }).meta({ graphqlName: 'Hub' });`,
    `export const hubRelations = relations(hub, ({ one, many }) => ({ single: one(model, { fields: [hub.modelId], references: [model.id], relationName: 'single' }), list: many(model, { relationName: 'list' }) }));`,
    `export const modelRelations = relations(model, ({ one }) => ({ hub: one(hub, { fields: [model.hubId], references: [hub.id], relationName: 'list' }) }));`,
  ].join('\n');

const program = (files: readonly string[]): ts.Program =>
  ts.createProgram([...files], {
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
      'drizzle-orm': ['packages/graphql-drizzle/node_modules/drizzle-orm'],
      'drizzle-orm/*': ['packages/graphql-drizzle/node_modules/drizzle-orm/*'],
      'drizzle-metadata': [
        'packages/graphql-drizzle/node_modules/drizzle-metadata/dist/index.d.ts',
      ],
      'drizzle-metadata/register': [
        'packages/graphql-drizzle/node_modules/drizzle-metadata/dist/register.d.ts',
      ],
    },
  });

const generate = async (name: string, index: number): Promise<string> => {
  const schemaFile = resolve(directory, `schema${index}.ts`);
  await writeFile(schemaFile, schemaSource(name));
  const schema: unknown = await import(/* @vite-ignore */ schemaFile);
  const result = readSchema(
    typeof schema === 'object' && schema !== null ? Object.fromEntries(Object.entries(schema)) : {},
  );
  if (result.kind === 'error') throw new Error(result.message);
  const generated = resolve(directory, `generated${index}.ts`);
  await writeFile(
    generated,
    renderModels(result.models, {
      schemaImport: `./schema${index}`,
      databaseImport: specifier(directory, resolve(__dirname, 'test/fixtures/database.service')),
      databaseExport: 'DrizzleService',
      source: `generated${index}.ts`,
      header: '// generated',
    }),
  );
  return generated;
};

it('either rejects a TypeScript keyword as a model name or generates a module that type-checks', async () => {
  const accepted = candidates().filter((name) => {
    const table = sqliteTable('model', { id: text().primaryKey() }).meta({ graphqlName: name });
    return readSchema({ table }).kind === 'success';
  });
  // Contextual keywords stay usable, so the type check below is never vacuous.
  expect(accepted).toEqual(expect.arrayContaining(['type', 'as', 'namespace']));
  const files = await Promise.all(accepted.map(generate));
  const checked = program(files);
  const failing = accepted.filter((_name, index) => {
    const file = checked.getSourceFile(files[index] ?? '');
    return ts.getPreEmitDiagnostics(checked, file).length > 0;
  });
  expect(failing).toEqual([]);
}, 120_000);
