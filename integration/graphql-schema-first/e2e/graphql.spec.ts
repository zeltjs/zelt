import { readFile } from 'node:fs/promises';
import { onTest, shutdownAll } from '@zeltjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createGraphqlSchemaFirstApp } from '../src/app';
import { prepareGeneratedRuntime, resolverChecksPath, runtimeModulePath } from './generated';

type AppRuntime = Awaited<
  ReturnType<ReturnType<typeof createGraphqlSchemaFirstApp>['createRuntime']>
>;

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
    await expect(readFile(resolverChecksPath, 'utf8')).resolves.toContain(
      'Gql.Query.product.Result',
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
