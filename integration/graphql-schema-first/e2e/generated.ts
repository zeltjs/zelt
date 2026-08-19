import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { writePrebuiltModule } from '@zeltjs/cli';
import type { ZeltPrebuilt } from '@zeltjs/core';
import { graphqlPlugin } from '@zeltjs/graphql/codegen';

import { createGraphqlSchemaFirstApp } from '../src/app';

export const cwd = resolve(__dirname, '..');
export const tsconfig = resolve(cwd, 'tsconfig.json');
export const schema = resolve(cwd, 'src/graphql/schema.graphql');
const zeltDir = resolve(cwd, '.zelt');
export const runtimeFilePath = resolve(zeltDir, 'graphql/graphql.runtime.ts');
export const resolverChecksPath = resolve(cwd, 'src/generated/graphql-resolver-checks.ts');

export const prepareZeltPrebuilt = async (): Promise<ZeltPrebuilt> => {
  await rm(zeltDir, { recursive: true, force: true });
  await rm(resolverChecksPath, { force: true });

  const app = createGraphqlSchemaFirstApp();
  const plugin = graphqlPlugin({
    mode: 'schema-first',
    schema,
    tsconfig,
    resolverChecks: {
      out: resolverChecksPath,
      gqlTypesImport: './graphql',
    },
  });
  const contributions =
    (await plugin.preBuild?.({ cwd, build: {}, loadStaticApp: async () => app })) ?? [];
  await writePrebuiltModule(cwd, contributions);

  const prebuiltModule = (await import(
    /* @vite-ignore */ pathToFileURL(resolve(zeltDir, 'prebuilt.ts')).href
  )) as { readonly zeltPrebuilt: ZeltPrebuilt };
  return prebuiltModule.zeltPrebuilt;
};
