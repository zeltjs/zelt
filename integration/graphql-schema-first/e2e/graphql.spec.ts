import { readFile } from 'node:fs/promises';
import { onTest, shutdownAll } from '@zeltjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createGraphqlSchemaFirstApp } from '../src/app';
import {
  adminResolverChecksPath,
  adminRuntimeFilePath,
  prepareZeltPrebuilt,
  storefrontResolverChecksPath,
  storefrontRuntimeFilePath,
} from './generated';

type AppRuntime = Awaited<
  ReturnType<ReturnType<typeof createGraphqlSchemaFirstApp>['createRuntime']>
>;

type GraphqlErrorBody = {
  readonly data?: unknown;
  readonly errors?: readonly { readonly message: string }[];
};

const postGraphql = (runtime: AppRuntime, path: string, query: string): Promise<Response> =>
  runtime.http.request(path, {
    method: 'POST',
    body: JSON.stringify({ query }),
    headers: { 'content-type': 'application/json' },
  });

describe('GraphQL schema-first app', () => {
  let runtime: AppRuntime;

  beforeAll(async () => {
    const zeltPrebuilt = await prepareZeltPrebuilt();
    runtime = await onTest(createGraphqlSchemaFirstApp(), { prebuilt: zeltPrebuilt });
  });

  afterAll(async () => {
    await shutdownAll();
  });

  it('runs the storefront schema-first resolver through the generated GraphQL runtime over HTTP', async () => {
    await expect(readFile(storefrontRuntimeFilePath, 'utf8')).resolves.toContain(
      'export const graphqlPrebuilt',
    );
    await expect(readFile(storefrontResolverChecksPath, 'utf8')).resolves.toContain(
      'Gql.Query.product.Result',
    );

    const response = await postGraphql(
      runtime,
      '/graphql',
      '{ product(id: "p_lamp") { id name } }',
    );

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

  it('runs the admin schema-first resolver on its own endpoint', async () => {
    await expect(readFile(adminRuntimeFilePath, 'utf8')).resolves.toContain(
      'export const graphqlPrebuilt',
    );
    await expect(readFile(adminResolverChecksPath, 'utf8')).resolves.toContain(
      'Gql.Query.orderCount.Result',
    );

    const response = await postGraphql(runtime, '/admin/graphql', '{ orderCount }');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { orderCount: 3 } });
  });

  it('keeps the two lines independent: each endpoint only recognizes its own schema', async () => {
    // orderCount belongs to the admin schema; the storefront endpoint's
    // introspected schema has never heard of it.
    const onStorefront = await postGraphql(runtime, '/graphql', '{ orderCount }');
    expect(onStorefront.status).toBe(200);
    const onStorefrontBody: GraphqlErrorBody = await onStorefront.json();
    expect(onStorefrontBody.errors?.[0]?.message).toMatch(/orderCount/);

    // product belongs to the storefront schema; the admin endpoint's schema
    // has never heard of it either.
    const onAdmin = await postGraphql(
      runtime,
      '/admin/graphql',
      '{ product(id: "p_lamp") { id } }',
    );
    expect(onAdmin.status).toBe(200);
    const onAdminBody: GraphqlErrorBody = await onAdmin.json();
    expect(onAdminBody.errors?.[0]?.message).toMatch(/product/);

    // The storefront endpoint keeps serving its own field after the admin
    // endpoint was queried, confirming the two lines don't share state.
    const productStillWorks = await postGraphql(
      runtime,
      '/graphql',
      '{ product(id: "p_lamp") { id name } }',
    );
    expect(productStillWorks.status).toBe(200);
    await expect(productStillWorks.json()).resolves.toEqual({
      data: { product: { id: 'p_lamp', name: 'Desk Lamp' } },
    });
  });
});
