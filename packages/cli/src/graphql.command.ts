import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { defineCommand } from 'citty';
import consola from 'consola';
import { match, P } from 'ts-pattern';

import { nodeCliRuntime } from './cli-runtime.lib';

type GraphqlCodegenArgs = {
  readonly schema?: string;
  readonly out?: string;
};

type GraphqlCodegenOptions = {
  readonly schema: string;
  readonly out: string;
};

type GraphqlCodegenResult = {
  readonly changed: boolean;
};

type GraphqlCodegenRunner = (options: GraphqlCodegenOptions) => Promise<GraphqlCodegenResult>;

type GraphqlCodegenModule = {
  readonly generateSchemaFirstCodegen: unknown;
};

const isCodegenResult = (result: unknown): result is GraphqlCodegenResult =>
  match(result)
    .with({ changed: P.boolean }, () => true)
    .otherwise(() => false);

/** @throws {Error} */
const readCodegenResult = (result: unknown): GraphqlCodegenResult => {
  if (!isCodegenResult(result)) {
    throw new Error('generateSchemaFirstCodegen result must include changed.');
  }
  return result;
};

/** @throws {Error} */
const toCodegenRunner = (runner: unknown): GraphqlCodegenRunner => {
  if (typeof runner !== 'function') {
    throw new Error('@zeltjs/graphql/codegen must export generateSchemaFirstCodegen.');
  }
  return async (options) => readCodegenResult(await Reflect.apply(runner, undefined, [options]));
};

const isCodegenModule = (mod: unknown): mod is GraphqlCodegenModule =>
  match(mod)
    .with({ generateSchemaFirstCodegen: P._ }, () => true)
    .otherwise(() => false);

/** @throws {Error} */
const readCodegenRunner = (mod: unknown): GraphqlCodegenRunner => {
  if (!isCodegenModule(mod)) {
    throw new Error('@zeltjs/graphql/codegen must export a module object.');
  }
  return toCodegenRunner(mod.generateSchemaFirstCodegen);
};

/** @throws {Error} */
const loadGraphqlCodegen = async (cwd: string): Promise<GraphqlCodegenRunner> => {
  const requireFromCwd = createRequire(resolve(cwd, 'package.json'));
  const codegenModule = requireFromCwd.resolve('@zeltjs/graphql/codegen');
  const mod: unknown = await import(pathToFileURL(codegenModule).href);
  return readCodegenRunner(mod);
};

/** @throws {Error} */
export const runGraphqlCodegen = async (
  cwd: string,
  args: GraphqlCodegenArgs,
  runner?: GraphqlCodegenRunner,
): Promise<GraphqlCodegenResult> => {
  if (!args.schema) {
    throw new Error('zelt graphql codegen requires --schema.');
  }
  if (!args.out) {
    throw new Error('zelt graphql codegen requires --out.');
  }
  const codegen = runner ?? (await loadGraphqlCodegen(cwd));
  return codegen({
    schema: resolve(cwd, args.schema),
    out: resolve(cwd, args.out),
  });
};

const codegenCommand = defineCommand({
  meta: {
    name: 'codegen',
    description: 'Generate schema-first GraphQL TypeScript helpers from SDL',
  },
  args: {
    schema: {
      type: 'string',
      description: 'Path to schema.graphql',
    },
    out: {
      type: 'string',
      description: 'Generated TypeScript output path',
    },
  },
  async run({ args }) {
    const result = await runGraphqlCodegen(nodeCliRuntime.cwd(), args);
    consola.success(result.changed ? 'GraphQL codegen completed' : 'GraphQL codegen unchanged');
  },
});

export const graphqlCommand = defineCommand({
  meta: {
    name: 'graphql',
    description: 'GraphQL development commands',
  },
  subCommands: {
    codegen: codegenCommand,
  },
});
