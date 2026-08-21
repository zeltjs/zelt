import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { writePrebuiltModule } from '@zeltjs/cli';
import type { ZeltPrebuilt } from '@zeltjs/core';
import { graphqlPlugin } from '@zeltjs/graphql/codegen';

import { createGraphqlSchemaFirstApp } from '../src/app';

export const cwd = resolve(__dirname, '..');
export const tsconfig = resolve(cwd, 'tsconfig.json');
const zeltDir = resolve(cwd, '.zelt');

// Each schema-first line's resolverChecks file is generated next to the
// codegen helper its schema hashes to: the storefront line pairs with
// src/generated/graphql.ts, the admin line with src/generated/admin.ts.
export const storefrontRuntimeFilePath = resolve(zeltDir, 'graphql/storefront.runtime.ts');
export const adminRuntimeFilePath = resolve(zeltDir, 'graphql/admin.runtime.ts');
export const storefrontResolverChecksPath = resolve(
  cwd,
  'src/generated/graphql.resolver-checks.ts',
);
export const adminResolverChecksPath = resolve(cwd, 'src/generated/admin.resolver-checks.ts');

export const prepareZeltPrebuilt = async (): Promise<ZeltPrebuilt> => {
  // Only the generated runtime output is cleared. `.zelt/graphql-codegen.json`
  // must survive: it's the manifest `zelt graphql codegen` just wrote during
  // prepare:integration, and resolverChecks generation looks up each
  // schema-first endpoint's helper through it.
  await rm(resolve(zeltDir, 'graphql'), { recursive: true, force: true });
  await rm(resolve(zeltDir, 'prebuilt.ts'), { force: true });
  await rm(storefrontResolverChecksPath, { force: true });
  await rm(adminResolverChecksPath, { force: true });

  const app = createGraphqlSchemaFirstApp();
  const plugin = graphqlPlugin({ tsconfig });
  // This helper resets `.zelt/graphql/` and the resolverChecks paths above
  // itself (see the `rm` calls above), so it doesn't need the output ledger
  // that a real `zelt build` runs through `registerGeneratedFile`.
  const contributions =
    (await plugin.preBuild?.({
      cwd,
      build: {},
      loadStaticApp: async () => app,
      registerGeneratedFile: () => {},
    })) ?? [];
  await writePrebuiltModule(cwd, contributions);

  const prebuiltModule = (await import(
    /* @vite-ignore */ pathToFileURL(resolve(zeltDir, 'prebuilt.ts')).href
  )) as { readonly zeltPrebuilt: ZeltPrebuilt };
  return prebuiltModule.zeltPrebuilt;
};
