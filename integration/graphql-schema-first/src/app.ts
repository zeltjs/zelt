import { createApp, http } from '@zeltjs/core';
import { graphql } from '@zeltjs/graphql';

import { StorefrontResolver } from './graphql/storefront.resolver';

export const createGraphqlSchemaFirstApp = () =>
  createApp([
    http({
      children: [
        graphql({
          path: '/graphql',
          resolvers: [StorefrontResolver],
        }),
      ],
    }),
  ]);

export const app = createGraphqlSchemaFirstApp();
