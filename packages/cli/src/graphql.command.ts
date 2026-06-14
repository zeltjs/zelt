import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { defineCommand } from 'citty';
import consola from 'consola';

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

const toRecord = (value: unknown): Readonly<Record<string, unknown>> | undefined =>
  typeof value === 'object' && value !== null
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;

/** @throws {Error} */
const loadGraphqlCodegen = async (cwd: string): Promise<GraphqlCodegenRunner> => {
  const requireFromCwd = createRequire(resolve(cwd, 'package.json'));
  const codegenModule = requireFromCwd.resolve('@zeltjs/graphql/codegen');
  const mod = toRecord(await import(pathToFileURL(codegenModule).href));
  const runner = mod?.['generateSchemaFirstCodegen'];
  if (typeof runner !== 'function') {
    throw new Error('@zeltjs/graphql/codegen must export generateSchemaFirstCodegen.');
  }
  return (options) => runner(options) as Promise<GraphqlCodegenResult>;
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
    const result = await runGraphqlCodegen(process.cwd(), args);
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
