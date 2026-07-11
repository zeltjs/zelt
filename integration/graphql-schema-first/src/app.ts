import { createApp, http } from '@zeltjs/core';
import { graphql } from '@zeltjs/graphql';

import { StorefrontResolver } from './graphql/storefront.resolver';

export const graphqlRuntimeModule = 'src/generated/graphql-runtime.js';
const graphqlRuntimeImport = './generated/graphql-runtime.js';

const loadGraphqlRuntime = (): Promise<unknown> => import(/* @vite-ignore */ graphqlRuntimeImport);

export const createGraphqlSchemaFirstApp = () =>
  createApp([
    http({
      children: [
        graphql({
          path: '/graphql',
          resolvers: [StorefrontResolver],
          runtimeLoader: loadGraphqlRuntime,
          runtimeModule: graphqlRuntimeModule,
        }),
      ],
    }),
  ]);

export const app = createGraphqlSchemaFirstApp();
