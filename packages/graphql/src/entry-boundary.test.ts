import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const buildTimeExports = [
  'generateGraphqlSdl',
  'graphqlPlugin',
  'generateSdlForResolvers',
  'generateGraphqlRuntimeForResolvers',
  'generateSchemaFirstCodegen',
  'generateSchemaFirstResolverChecks',
  'generateSchemaFirstGraphqlRuntimeForResolvers',
  'typeInfoToGraphqlType',
] as const;

const forbiddenRuntimeDependencyPattern =
  /(?:from\s+|import\s*\()['"](?:node:(?:fs|path|url)|@zeltjs\/decorator-metadata\/inspect)/;

const resolveSourceModule = (fromFile: string, specifier: string): string =>
  resolve(dirname(fromFile), `${specifier.replace(/\.js$/, '')}.ts`);

const collectLocalSpecifiers = (file: string, source: string): readonly string[] => {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, false);
  return sourceFile.statements.flatMap((statement) => {
    if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) return [];
    const specifier = statement.moduleSpecifier;
    return specifier && ts.isStringLiteral(specifier) && specifier.text.startsWith('.')
      ? [specifier.text]
      : [];
  });
};

const collectReachableSource = async (entryFile: string): Promise<ReadonlyMap<string, string>> => {
  const sources = new Map<string, string>();
  const pending = [entryFile];
  while (pending.length > 0) {
    const file = pending.pop();
    if (!file || sources.has(file)) continue;
    const source = await readFile(file, 'utf8');
    sources.set(file, source);
    for (const specifier of collectLocalSpecifiers(file, source)) {
      pending.push(resolveSourceModule(file, specifier));
    }
  }
  return sources;
};

describe('GraphQL public entry boundary', () => {
  it('exports build-time APIs only from the codegen entry', async () => {
    const runtime: Record<string, unknown> = await import('./index');
    const codegen: Record<string, unknown> = await import('./codegen');

    for (const name of buildTimeExports) {
      expect(runtime, `${name} must not be exported from @zeltjs/graphql`).not.toHaveProperty(name);
      expect(codegen, `${name} must be exported from @zeltjs/graphql/codegen`).toHaveProperty(name);
    }
  });

  it('does not reach Node file APIs or decorator inspection from the runtime entry', async () => {
    const entryFile = resolve(__dirname, 'index.ts');
    const sources = await collectReachableSource(entryFile);
    const violations = [...sources.entries()].flatMap(([file, source]) =>
      forbiddenRuntimeDependencyPattern.test(source) ? [file.replace(`${__dirname}/`, '')] : [],
    );

    expect(violations).toEqual([]);
  });
});
