import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  adminResolverChecksPath,
  adminRuntimeFilePath,
  prepareZeltPrebuilt,
  storefrontResolverChecksPath,
  storefrontRuntimeFilePath,
} from './generated';

describe('GraphQL schema-first generated files', () => {
  it('generates runtime and resolver check files for both endpoints before typechecking', async () => {
    await prepareZeltPrebuilt();

    await expect(readFile(storefrontRuntimeFilePath, 'utf8')).resolves.toContain(
      'export const graphqlPrebuilt',
    );
    await expect(readFile(adminRuntimeFilePath, 'utf8')).resolves.toContain(
      'export const graphqlPrebuilt',
    );
    await expect(readFile(storefrontResolverChecksPath, 'utf8')).resolves.toContain(
      'Gql.Query.product.Result',
    );
    await expect(readFile(adminResolverChecksPath, 'utf8')).resolves.toContain(
      'Gql.Query.orderCount.Result',
    );
  });
});
