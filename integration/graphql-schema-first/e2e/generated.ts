import { mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { generateGraphqlSdl } from '@zeltjs/graphql';

import { createGraphqlSchemaFirstApp, graphqlRuntimeModule } from '../src/app';

export const tsconfig = resolve(__dirname, '../tsconfig.json');
export const schema = resolve(__dirname, '../src/graphql/schema.graphql');
export const runtimeModulePath = resolve(__dirname, '..', graphqlRuntimeModule);
export const generatedDir = dirname(runtimeModulePath);
export const resolverChecksPath = resolve(generatedDir, 'graphql-resolver-checks.ts');

export const prepareGeneratedRuntime = async (): Promise<void> => {
  await rm(runtimeModulePath, { force: true });
  await rm(resolverChecksPath, { force: true });
  await mkdir(generatedDir, { recursive: true });

  const app = createGraphqlSchemaFirstApp();
  await generateGraphqlSdl(app.http, {
    mode: 'schema-first',
    schema,
    runtimeModule: runtimeModulePath,
    resolverChecks: {
      out: resolverChecksPath,
      gqlTypesImport: './graphql',
    },
    distDir: generatedDir,
    tsconfig,
  });
};
