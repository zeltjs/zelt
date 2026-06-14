import { mkdir, readFile, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { generateGraphqlSdl } from '@zeltjs/graphql';
import { onTest, shutdownAll } from '@zeltjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createGraphqlSchemaFirstApp, graphqlRuntimeModule } from '../src/app';

const tsconfig = resolve(__dirname, '../tsconfig.json');
const schema = resolve(__dirname, '../src/graphql/schema.graphql');
const runtimeModulePath = resolve(__dirname, '..', graphqlRuntimeModule);
const generatedDir = dirname(runtimeModulePath);

type AppRuntime = Awaited<
  ReturnType<ReturnType<typeof createGraphqlSchemaFirstApp>['createRuntime']>
>;

const prepareGeneratedRuntime = async (): Promise<void> => {
  await rm(runtimeModulePath, { force: true });
  await mkdir(generatedDir, { recursive: true });

  const app = createGraphqlSchemaFirstApp();
  await generateGraphqlSdl(app.http, {
    mode: 'schema-first',
    schema,
    runtimeModule: runtimeModulePath,
    distDir: generatedDir,
    tsconfig,
  });
};

const postGraphql = (runtime: AppRuntime, query: string): Promise<Response> =>
  runtime.http.request('/graphql', {
    method: 'POST',
    body: JSON.stringify({ query }),
    headers: { 'content-type': 'application/json' },
  });

describe('GraphQL schema-first app', () => {
  let runtime: AppRuntime;

  beforeAll(async () => {
    await prepareGeneratedRuntime();
    runtime = await onTest(createGraphqlSchemaFirstApp());
  });

  afterAll(async () => {
    await shutdownAll();
  });

  it('runs a schema-first resolver through the generated GraphQL runtime over HTTP', async () => {
    await expect(readFile(runtimeModulePath, 'utf8')).resolves.toContain(
      'export const graphqlRuntime',
    );

    const response = await postGraphql(runtime, '{ product(id: "p_lamp") { id name } }');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        product: {
          id: 'p_lamp',
          name: 'Desk Lamp',
        },
      },
    });
  });
});
