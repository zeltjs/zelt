import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { ZeltConfig } from '@zeltjs/cli';
import type { GraphqlResolverClass } from '@zeltjs/graphql';
import { generateGraphqlRuntimeForResolvers } from '@zeltjs/graphql/codegen';
import { valibotAdapter } from '@zeltjs/validator-valibot/openapi';
import type { GraphQLNamedType } from 'graphql';
import { buildSchema, isObjectType } from 'graphql';
import ts from 'typescript';
import { afterAll, describe, expect, it } from 'vitest';
import { codeFences } from '../src/twoslash/code-fences.lib';
import { graphqlDrizzleSetup } from '../src/twoslash/graphql-drizzle-setup.lib';
import { importModule, virtualFiles, writeProject } from './guide-project.lib';

// The guide shows the generated file and the resulting SDL instead of letting readers run the
// generator. This test runs the real generator on the guide's own schema and config blocks and
// checks that what the guide shows is what the generator produces.
const websiteDir = join(import.meta.dirname, '..');
const workDir = join(websiteDir, '.generated/graphql-drizzle-guide');
const guides = {
  en: join(websiteDir, 'docs/graphql-drizzle.md'),
  ja: join(websiteDir, 'i18n/ja/docusaurus-plugin-content-docs/current/graphql-drizzle.md'),
};
const databaseService = join(
  websiteDir,
  'src/twoslash/fixtures/graphql-drizzle/drizzle.service.ts',
);
const root = 'graphql-drizzle';
const generatedFile = `${root}/src/generated/drizzle-graphql.ts`;

type Generated = { readonly excerpt: string; readonly actual: string; readonly dir: string };

// Each guide gets its own project: the files the type-checker shares between the guide's
// blocks, plus the config block, with the shown generated file replaced by the real output.
const generate = async (lang: string, markdown: string): Promise<Generated> => {
  const shared = graphqlDrizzleSetup(markdown, await readFile(databaseService, 'utf8'));
  const config = codeFences(markdown, 'ts')
    .flatMap(virtualFiles)
    .find((file) => file.name === `${root}/zelt.config.ts`);
  if (!config) throw new Error('The guide has no zelt.config.ts block');
  const dir = join(workDir, lang);
  await writeProject(dir, [
    ...Object.entries(shared).map(([name, content]) => ({ name, content })),
    config,
  ]);
  const zelt = asConfig((await importModule(join(dir, config.name)))['default']);
  const plugin = zelt.plugins?.find((candidate) => candidate.name === 'graphql-drizzle');
  if (!plugin?.preBuild || !plugin.postBuild) throw new Error('The config has no Drizzle plugin');
  const context = {
    cwd: join(dir, root),
    build: {},
    loadModule: importModule,
    loadStaticApp: async () => zelt.app(),
    registerGeneratedFile: () => {},
  };
  await plugin.preBuild(context);
  // Registration is checked against the guide's app, as `zelt build` does after bundling.
  await plugin.postBuild(context, { success: true });
  return {
    excerpt: shared[generatedFile] ?? '',
    actual: await readFile(join(dir, generatedFile), 'utf8'),
    dir,
  };
};

function asConfig(value: unknown): ZeltConfig;
function asConfig(value: unknown): unknown {
  if (typeof value !== 'object' || value === null)
    throw new Error('The config block has no default export');
  return value;
}

function asResolver(value: unknown): GraphqlResolverClass;
function asResolver(value: unknown): unknown {
  if (typeof value !== 'function') throw new Error('Guide module does not export a resolver');
  return value;
}

const parse = (code: string): ts.SourceFile =>
  ts.createSourceFile('excerpt.ts', code, ts.ScriptTarget.Latest, true);

// Comparing tokens keeps formatting, comments and quote style out of the contract.
const tokens = (code: string): readonly string[] => {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, code);
  const result: string[] = [];
  for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
    result.push(
      kind === ts.SyntaxKind.StringLiteral
        ? JSON.stringify(scanner.getTokenValue())
        : scanner.getTokenText(),
    );
  }
  return result;
};

type Imports = ReadonlyMap<
  string,
  { readonly names: ReadonlySet<string>; readonly namespace?: string }
>;

const importsOf = (file: ts.SourceFile): Imports =>
  new Map(
    file.statements.filter(ts.isImportDeclaration).map((statement) => {
      const specifier = ts.isStringLiteral(statement.moduleSpecifier)
        ? statement.moduleSpecifier.text
        : '';
      const bindings = statement.importClause?.namedBindings;
      return [
        specifier,
        bindings && ts.isNamespaceImport(bindings)
          ? { names: new Set<string>(), namespace: bindings.name.text }
          : { names: new Set(bindings?.elements.map((element) => element.name.text) ?? []) },
      ] as const;
    }),
  );

const declarationName = (statement: ts.Statement): string | undefined => {
  if (ts.isVariableStatement(statement))
    return statement.declarationList.declarations.map((item) => item.name.getText()).join(',');
  return ts.isInterfaceDeclaration(statement) ||
    ts.isClassDeclaration(statement) ||
    ts.isTypeAliasDeclaration(statement) ||
    ts.isFunctionDeclaration(statement) ||
    ts.isEnumDeclaration(statement)
    ? statement.name?.text
    : undefined;
};

// A class or interface whose body is a single block comment stands for "body omitted":
// only the part up to `{` (modifiers, name, heritage) is part of the excerpt.
const elidedHeader = (statement: ts.Statement, file: ts.SourceFile): string | undefined => {
  if (!ts.isClassDeclaration(statement) && !ts.isInterfaceDeclaration(statement)) return undefined;
  if (statement.members.length > 0) return undefined;
  const text = statement.getText(file);
  const brace = text.indexOf('{');
  return /^\{\s*\/\*[\s\S]*\*\/\s*\}$/.test(text.slice(brace)) ? text.slice(0, brace) : undefined;
};

const header = (statement: ts.Statement, file: ts.SourceFile): string => {
  const text = statement.getText(file);
  return text.slice(0, text.indexOf('{'));
};

/**
 * The excerpt rule: every import in the excerpt is available from the same module in the
 * real file (by name, or through a namespace import), and every other top-level declaration
 * of the excerpt has a declaration of the same kind and name in the real file with the same
 * tokens. Declarations may be omitted and reordered. A body that is only a block comment
 * omits the body. A reference written `x` in the excerpt matches `ns.x` in the real file
 * when the excerpt imports `x` from the module the real file imports as `ns`.
 */
const excerptMismatches = (excerpt: string, actual: string): readonly string[] => {
  const shown = parse(excerpt);
  const real = parse(actual);
  const realImports = importsOf(real);
  const namespaces = new Set(
    [...importsOf(shown).keys()].flatMap(
      (specifier) => realImports.get(specifier)?.namespace ?? [],
    ),
  );
  const normalize = (code: string): string =>
    tokens(code)
      .filter(
        (token, index, all) =>
          !(namespaces.has(token) && all[index + 1] === '.') &&
          !(token === '.' && namespaces.has(all[index - 1] ?? '')),
      )
      .join(' ');
  const importErrors = [...importsOf(shown)].flatMap(([specifier, { names }]) => {
    const available = realImports.get(specifier);
    return [...names]
      .filter((name) => available?.namespace === undefined && !available?.names.has(name))
      .map((name) => `import ${name} from ${specifier} is not in the generated file`);
  });
  const declarationErrors = shown.statements
    .filter((statement) => !ts.isImportDeclaration(statement))
    .flatMap((statement) => {
      const name = declarationName(statement);
      const counterpart = real.statements.find(
        (candidate) => candidate.kind === statement.kind && declarationName(candidate) === name,
      );
      if (!counterpart) return [`${name} is not in the generated file`];
      const elided = elidedHeader(statement, shown);
      const expected = elided ?? statement.getText(shown);
      const received = elided === undefined ? counterpart.getText(real) : header(counterpart, real);
      return normalize(expected) === normalize(received)
        ? []
        : [`${name} differs:\n--- guide\n${expected}\n--- generated\n${received}`];
    });
  return [...importErrors, ...declarationErrors];
};

// Fields of the generated models; resolver-declared fields (`declare module`) are not in it.
const generatedFields = (actual: string): ReadonlyMap<string, readonly string[]> => {
  const real = parse(actual);
  return new Map(
    real.statements
      .filter(ts.isInterfaceDeclaration)
      .map((model) => [
        model.name.text,
        model.members
          .map((member) => member.name?.getText(real) ?? '')
          .filter((field) => !field.startsWith('$')),
      ]),
  );
};

const fieldsOf = (type: GraphQLNamedType | null | undefined): readonly string[] =>
  isObjectType(type)
    ? Object.values(type.getFields()).map((field) => `${field.name}: ${String(field.type)}`)
    : [];

const generatedSdl = async (dir: string): Promise<string> => {
  const resolvers = await Promise.all(
    [
      ['user.resolver.ts', 'UserResolver'],
      ['post.resolver.ts', 'PostResolver'],
    ].map(async ([file = '', name = '']) =>
      asResolver((await importModule(join(dir, root, 'src/graphql', file)))[name]),
    ),
  );
  const runtime = await generateGraphqlRuntimeForResolvers(resolvers, {
    tsconfig: join(dir, 'tsconfig.json'),
    schemaAdapter: valibotAdapter,
  });
  return runtime.schemaSdl;
};

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe.each(Object.entries(guides))('GraphQL Drizzle guide (%s)', (lang, path) => {
  // Generation runs the real build plugin once per guide; both tests read the same output.
  let loaded: Promise<{ readonly markdown: string; readonly generated: Generated }> | undefined;
  const load = () => {
    loaded ??= readFile(path, 'utf8').then(async (markdown) => ({
      markdown,
      generated: await generate(lang, markdown),
    }));
    return loaded;
  };

  it('shows an excerpt of what the generator emits for the guide schema', async () => {
    const { generated } = await load();
    expect(excerptMismatches(generated.excerpt, generated.actual)).toEqual([]);
  }, 60_000);

  // Building the SDL type-checks the guide's app with the TypeScript compiler, which is slow.
  it('shows the SDL the generated models contribute, and Query has only the written @Query', async () => {
    const { markdown, generated } = await load();
    const shownBlock = codeFences(markdown, 'graphql').find((block) => block.includes('type '));
    const shown = buildSchema(shownBlock ?? '');
    const real = buildSchema(await generatedSdl(generated.dir));
    const models = generatedFields(generated.actual);
    const shownTypes = Object.keys(shown.getTypeMap()).filter((name) => !name.startsWith('__'));
    expect(shownTypes.filter((name) => isObjectType(shown.getType(name)))).toEqual([
      ...models.keys(),
    ]);
    for (const [model, fields] of models) {
      const realFields = fieldsOf(real.getType(model)).filter((field) =>
        fields.includes(field.split(':')[0] ?? ''),
      );
      expect(fieldsOf(shown.getType(model)), model).toEqual(realFields);
    }
    // The guide's user.resolver.ts adds `displayName` and writes the only @Query, `user`.
    expect(fieldsOf(real.getType('User'))).toContain('displayName: String!');
    expect(Object.keys(real.getQueryType()?.getFields() ?? {})).toEqual(['user']);
  }, 60_000);
});
