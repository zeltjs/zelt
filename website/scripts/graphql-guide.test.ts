import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { App, ConfiguredFeature } from '@zeltjs/core';
import type { GraphqlResolverClass } from '@zeltjs/graphql';
import { computeGraphqlPrebuiltHash } from '@zeltjs/graphql';
import { generateGraphqlRuntimeForResolvers } from '@zeltjs/graphql/codegen';
import { valibotAdapter } from '@zeltjs/validator-valibot/openapi';
import { buildSchema, printSchema } from 'graphql';
import { afterAll, describe, expect, it } from 'vitest';

// The guide is the user-facing contract. This test does not restate its code: it runs the
// guide's own code blocks and checks the schemas and responses the guide claims.
const websiteDir = join(import.meta.dirname, '..');
const workDir = join(websiteDir, '.generated/graphql-guide');
// Sample data differs by language; the expected names are the ones each guide prints.
const guides = {
  en: {
    path: join(websiteDir, 'docs/graphql.md'),
    names: { u1: 'Yamada Taro', first: 'Taro', last: 'Yamada', u2: 'John Doe' },
  },
  ja: {
    path: join(websiteDir, 'i18n/ja/docusaurus-plugin-content-docs/current/graphql.md'),
    names: { u1: '山田 太郎', first: '太郎', last: '山田', u2: 'John Doe' },
  },
};

type GuideFile = { readonly name: string; readonly content: string };

const fences = (markdown: string, lang: string): readonly string[] =>
  [...markdown.matchAll(new RegExp(`\`\`\`${lang}\\n([\\s\\S]*?)\`\`\``, 'g'))].map(
    (match) => match[1] ?? '',
  );

// Twoslash cut markers only hide lines from the rendered page; the program keeps them.
const virtualFiles = (block: string): readonly GuideFile[] =>
  block
    .split(/^\/\/ @filename:\s*/m)
    .slice(1)
    .map((part) => {
      const [name = '', ...lines] = part.split('\n');
      const content = lines.filter((line) => !/^\/\/ ---cut(-after)?---$/.test(line)).join('\n');
      return { name: name.trim(), content };
    });

const tsconfig = {
  compilerOptions: {
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'Bundler',
    strict: true,
    skipLibCheck: true,
  },
  include: ['**/*.ts'],
};

const writeProject = async (dir: string, files: readonly GuideFile[]): Promise<void> => {
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'tsconfig.json'), JSON.stringify(tsconfig));
  for (const file of files) {
    await mkdir(dirname(join(dir, file.name)), { recursive: true });
    await writeFile(join(dir, file.name), file.content);
  }
};

const importModule = async (path: string): Promise<Record<string, unknown>> => {
  const loaded: unknown = await import(pathToFileURL(path).href);
  return typeof loaded === 'object' && loaded !== null
    ? Object.fromEntries(Object.entries(loaded))
    : {};
};

function asResolver(value: unknown): GraphqlResolverClass;
function asResolver(value: unknown): unknown {
  if (typeof value !== 'function') throw new Error('Guide module does not export a resolver');
  return value;
}

function asApp(value: unknown): App<readonly ConfiguredFeature[]>;
function asApp(value: unknown): unknown {
  if (typeof value !== 'object' || value === null)
    throw new Error('Guide module does not export app');
  return value;
}

type Endpoint = {
  readonly schemaSdl: string;
  readonly query: (source: string) => Promise<unknown>;
};

const startGuideApp = async (
  dir: string,
  appFile: string,
  resolverExports: readonly (readonly [string, string])[],
): Promise<Endpoint> => {
  const resolvers = await Promise.all(
    resolverExports.map(async ([file, name]) =>
      asResolver((await importModule(join(dir, file)))[name]),
    ),
  );
  const runtime = await generateGraphqlRuntimeForResolvers(resolvers, {
    tsconfig: join(dir, 'tsconfig.json'),
    schemaAdapter: valibotAdapter,
  });
  const resolversHash = await computeGraphqlPrebuiltHash('/graphql', resolvers);
  const app = asApp((await importModule(join(dir, appFile)))['app']);
  const running = await app.createRuntime({
    prebuilt: { version: 1, features: { graphql: { graphql: { runtime, resolversHash } } } },
  });
  return {
    schemaSdl: runtime.schemaSdl,
    query: async (source) => {
      const response = await running.http.request('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: source }),
      });
      return response.json();
    },
  };
};

const normalizedSchema = (sdl: string): string => printSchema(buildSchema(sdl));

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe.each(Object.entries(guides))('GraphQL guide (%s)', (lang, { path, names }) => {
  const load = async () => {
    const markdown = await readFile(path, 'utf8');
    return { ts: fences(markdown, 'ts'), graphql: fences(markdown, 'graphql') };
  };
  const project = async (block: string | undefined, name: string): Promise<string> => {
    const dir = join(workDir, `${lang}-${name}`);
    await writeProject(dir, virtualFiles(block ?? ''));
    return dir;
  };

  it('generates the schema shown for the minimal Query and ResolveField', async () => {
    const { ts, graphql } = await load();
    const dir = await project(ts[0], 'entry');
    const endpoint = await startGuideApp(dir, 'app.ts', [['user.resolver.ts', 'UserResolver']]);
    expect(normalizedSchema(endpoint.schemaSdl)).toBe(normalizedSchema(graphql[0] ?? ''));
    expect(await endpoint.query('{ user(id: "u1") { id name } }')).toEqual({
      data: { user: { id: 'u1', name: 'User u1' } },
    });
  });

  it.each([
    ['batch', 4],
    ['single', 9],
  ])('supplies properties with a %s ResolveMultiField and computes name', async (name, index) => {
    const { ts } = await load();
    const dir = await project(`${ts[index] ?? ''}\n${appFor(['UserResolver'])}`, `level2-${name}`);
    const endpoint = await startGuideApp(dir, 'app.ts', [['user.resolver.ts', 'UserResolver']]);
    expect(await endpoint.query('{ user(id: "u1") { name firstName lastName } }')).toEqual({
      data: { user: { name: names.u1, firstName: names.first, lastName: names.last } },
    });
    expect(await endpoint.query('{ users(ids: ["u2"]) { name } }')).toEqual({
      data: { users: [{ name: names.u2 }] },
    });
    expect(endpoint.schemaSdl).not.toContain('$familyNameFirst');
  });

  it('runs the nested Relation query of the completed app', async () => {
    const { ts } = await load();
    const dir = await project(ts[8], 'level3');
    const endpoint = await startGuideApp(dir, 'src/app.ts', [
      ['src/user.resolver.ts', 'UserResolver'],
      ['src/post.resolver.ts', 'PostResolver'],
    ]);
    const nested = graphqlQuery(await load());
    expect(await endpoint.query(nested)).toEqual({
      data: {
        users: [
          { name: names.u1, posts: [{ title: 'Hello', author: { name: names.u1 } }] },
          { name: names.u2, posts: [] },
        ],
      },
    });
  });
});

// Level 2 blocks show resolvers only; the guide mounts them with the entry-point app.
const appFor = (resolvers: readonly string[]): string => `// @filename: app.ts
import { createApp, http } from '@zeltjs/core';
import { graphql } from '@zeltjs/graphql';
import { ${resolvers.join(', ')} } from './user.resolver';

export const app = createApp([
  http({ children: [graphql({ path: '/graphql', resolvers: [${resolvers.join(', ')}] })] }),
]);
`;

const graphqlQuery = ({ graphql }: { readonly graphql: readonly string[] }): string => {
  const query = graphql.find((block) => block.trimStart().startsWith('query {'));
  if (!query) throw new Error('The guide has no nested query example');
  return query;
};
