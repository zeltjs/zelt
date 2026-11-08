import { describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { extractTypeScriptExamples } from '../src/twoslash/documentation-parser.lib';

const root = resolve(import.meta.dir, '../..');
const cli = join(root, 'packages/cli/bin/zelt.mjs');
const compiler = join(root, 'node_modules/typescript/bin/tsc');

const run = (cwd: string, args: readonly string[]): string => {
  const result = spawnSync('node', [...args], { cwd, encoding: 'utf8', timeout: 90_000 });
  if (result.error) throw result.error;
  expect(result.status, result.stdout + result.stderr).toBe(0);
  return result.stdout + result.stderr;
};

const visibleCode = (code: string): string => {
  const parts = code.split('// ---cut---\n');
  const visible = parts.at(-1);
  if (visible === undefined) throw new Error('Missing example code');
  return visible.split('// ---cut-after---')[0];
};

const virtualFiles = (code: string): ReadonlyMap<string, string> => {
  const files = new Map<string, string>();
  const parts = code.split(/^\/\/ @filename:\s*(.+)$/m);
  for (let index = 1; index < parts.length; index += 2) {
    const name = parts[index];
    const content = parts[index + 1];
    if (!name || content === undefined) throw new Error('Malformed example files');
    files.set(name.trim(), content);
  }
  return files;
};

const write = (cwd: string, name: string, content: string): void => {
  const path = resolve(cwd, name);
  if (!path.startsWith(`${cwd}/`)) throw new Error('Example path escapes its project');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
};

const exampleContaining = (examples: readonly { code: string }[], text: string): string => {
  const example = examples.find((candidate) => visibleCode(candidate.code).includes(text));
  if (!example) throw new Error(`Missing documented example: ${text}`);
  return example.code;
};

const prepare = (cwd: string): void => {
  const packages = join(cwd, 'node_modules/@zeltjs');
  mkdirSync(packages, { recursive: true });
  for (const name of ['core', 'graphql', 'adapter-node', 'cli', 'validator-valibot']) {
    symlinkSync(join(root, 'packages', name), join(packages, name), 'dir');
  }
  symlinkSync(join(root, 'website/node_modules/valibot'), join(cwd, 'node_modules/valibot'), 'dir');
  write(cwd, 'package.json', JSON.stringify({ name: 'graphql-guide-fixture', type: 'module' }));
  write(
    cwd,
    'tsconfig.json',
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        strict: true,
        skipLibCheck: true,
        noEmit: true,
        types: ['node'],
      },
      include: ['src/**/*.ts', '.zelt/**/*.ts', 'zelt.config.ts', 'tsdown.config.ts'],
    }),
  );
};

const useCommonJsInputs = (cwd: string, source: string): void => {
  const declarations =
    'export const GetUserInput = v.object({ id: v.string() });\nexport const GetUsersInput = v.object({ ids: v.array(v.string()) });';
  if (!source.includes(declarations)) throw new Error('Documented argument schemas changed');
  write(
    cwd,
    'src/user.resolver.ts',
    source
      .replace(declarations, "import { GetUserInput, GetUsersInput } from './inputs.cjs';")
      .replace("import * as v from 'valibot';\n", ''),
  );
  write(
    cwd,
    'src/inputs.cjs',
    `const v = require('valibot');
const schemas = {
  [['Get', 'User', 'Input'].join('')]: v.object({ id: v.string() }),
  [['Get', 'Users', 'Input'].join('')]: v.object({ ids: v.array(v.string()) }),
};
module.exports = schemas;
`,
  );
  write(
    cwd,
    'src/inputs.d.cts',
    `import type { StandardSchemaV1 } from '@zeltjs/graphql';
export const GetUserInput: StandardSchemaV1<{ id: string }, { id: string }>;
export const GetUsersInput: StandardSchemaV1<{ ids: string[] }, { ids: string[] }>;
`,
  );
};

const checkRequest = (cwd: string, query: string, data: unknown): void => {
  const driver = `import assert from 'node:assert/strict';
import { nodeApp } from './dist/node.js';
try {
  const response = await nodeApp.http.request('/graphql', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: $QUERY }),
  });
  assert.deepEqual(await response.json(), { data: $DATA });
} finally { await nodeApp.shutdown(); }
`;
  write(
    cwd,
    'request.mjs',
    driver.replace('$QUERY', JSON.stringify(query)).replace('$DATA', JSON.stringify(data)),
  );
  run(cwd, ['request.mjs']);
};

describe('GraphQL guide applications', () => {
  for (const locale of ['en', 'ja']) {
    for (const mode of ['code-first', 'schema-first']) {
      for (const format of mode === 'code-first' ? ['inline', 'commonjs'] : ['inline']) {
        it(`${locale}: ${mode}/${format} generates, typechecks, builds and serves the documented app`, () => {
          const doc =
            locale === 'en'
              ? 'website/docs/graphql.md'
              : 'website/i18n/ja/docusaurus-plugin-content-docs/current/graphql.md';
          const markdown = readFileSync(join(root, doc), 'utf8');
          const examples = extractTypeScriptExamples(markdown);
          mkdirSync(join(root, '.tmp'), { recursive: true });
          const cwd = mkdtempSync(join(root, '.tmp/graphql-guide-'));
          try {
            prepare(cwd);
            if (mode === 'code-first') {
              const code = exampleContaining(examples, 'resolvers: [UserResolver, PostResolver]');
              for (const [name, content] of virtualFiles(code)) write(cwd, name, content);
              if (format === 'commonjs') {
                const user = virtualFiles(code).get('src/user.resolver.ts');
                if (!user) throw new Error('Missing documented user resolver');
                useCommonJsInputs(cwd, user);
              }
            } else {
              const code = exampleContaining(examples, 'class ProductResolver');
              const files = virtualFiles(code);
              const resolver = files.get('src/graphql/product.resolver.ts');
              if (!resolver) throw new Error('Resolver path does not match the documented layout');
              write(cwd, 'src/graphql/product.resolver.ts', resolver);
              write(
                cwd,
                'src/app.ts',
                visibleCode(exampleContaining(examples, 'resolvers: [ProductResolver]')),
              );
              const schema = markdown.match(
                /```graphql\n(type Query \{\n {2}product[\s\S]*?)```/,
              )?.[1];
              if (!schema) throw new Error('Missing documented SDL');
              write(cwd, 'src/graphql/schema.graphql', schema);
              const command = markdown.match(/```bash\n(zelt graphql codegen[^\n]*)/)?.[1];
              if (!command) throw new Error('Missing documented codegen command');
              run(cwd, [cli, ...command.split(/\s+/).slice(1)]);
            }
            write(
              cwd,
              'zelt.config.ts',
              visibleCode(exampleContaining(examples, 'export default defineConfig')),
            );
            write(
              cwd,
              'src/node.ts',
              `${visibleCode(exampleContaining(examples, 'const nodeApp'))}\nexport { nodeApp };\n`,
            );
            write(
              cwd,
              'tsdown.config.ts',
              visibleCode(exampleContaining(examples, 'plugins: [swc')),
            );
            const buildLog = run(cwd, [cli, 'build']);
            expect(existsSync(join(cwd, '.zelt/prebuilt.ts')), buildLog).toBe(true);
            run(cwd, [compiler, '--project', 'tsconfig.json']);
            if (mode === 'code-first') {
              const name = locale === 'en' ? 'Yamada Taro' : '山田 太郎';
              checkRequest(cwd, '{ users(ids: ["u1"]) { name posts { title author { name } } } }', {
                users: [{ name, posts: [{ title: 'Hello', author: { name } }] }],
              });
            } else
              checkRequest(cwd, '{ product(id: "p1") { id name } }', {
                product: { id: 'p1', name: 'Keyboard' },
              });
          } finally {
            rmSync(cwd, { recursive: true, force: true });
          }
        }, 120_000);
      }
    }
  }
});
