import { createApp, http } from '@zeltjs/core';
import { graphql } from '@zeltjs/graphql';

import { schema as adminSchema } from './generated/admin';
import { schema as storefrontSchema } from './generated/graphql';
import { AdminResolver } from './graphql/admin.resolver';
import { StorefrontResolver } from './graphql/storefront.resolver';

export const createGraphqlSchemaFirstApp = () =>
  createApp([
    http({
      children: [
        graphql({
          name: 'storefront',
          path: '/graphql',
          resolvers: [StorefrontResolver],
          schema: storefrontSchema,
        }),
        graphql({
          name: 'admin',
          path: '/admin/graphql',
          resolvers: [AdminResolver],
          schema: adminSchema,
        }),
      ],
    }),
  ]);

export const app = createGraphqlSchemaFirstApp();
