import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { prepareGeneratedRuntime, resolverChecksPath, runtimeModulePath } from './generated';

describe('GraphQL schema-first generated files', () => {
  it('generates runtime and resolver check files before typechecking', async () => {
    await prepareGeneratedRuntime();

    await expect(readFile(runtimeModulePath, 'utf8')).resolves.toContain(
      'export const graphqlRuntime',
    );
    await expect(readFile(resolverChecksPath, 'utf8')).resolves.toContain(
      'Gql.Query.product.Result',
    );
  });
});
