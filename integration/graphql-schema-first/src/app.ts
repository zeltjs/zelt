import { createApp, http } from '@zeltjs/core';
import { graphql } from '@zeltjs/graphql';

import { StorefrontResolver } from './graphql/storefront.resolver';

export const graphqlRuntimeModule = 'src/generated/graphql-runtime.js';

export const createGraphqlSchemaFirstApp = () =>
  createApp([
    http({
      children: [
        graphql({
          path: '/graphql',
          resolvers: [StorefrontResolver],
          runtimeModule: graphqlRuntimeModule,
        }),
      ],
    }),
  ]);

export const app = createGraphqlSchemaFirstApp();
