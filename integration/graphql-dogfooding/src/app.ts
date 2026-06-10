import { createApp, http } from '@zeltjs/core';
import { graphql } from '@zeltjs/graphql';

import { HealthController } from './entry/http/health.controller';
import { OrderFieldsResolver } from './graphql/order-fields.resolver';
import { StorefrontResolver } from './graphql/storefront.resolver';
import { StorefrontFieldsResolver } from './graphql/storefront-fields.resolver';
import { StorefrontMutationResolver } from './graphql/storefront-mutation.resolver';

export const graphqlRuntimeModule = 'src/generated/graphql-runtime.js';

export const createGraphqlDogfoodingApp = () =>
  createApp([
    http({
      controllers: [HealthController],
      children: [
        graphql('/graphql', {
          resolvers: [
            StorefrontResolver,
            StorefrontFieldsResolver,
            OrderFieldsResolver,
            StorefrontMutationResolver,
          ],
          runtimeModule: graphqlRuntimeModule,
        }),
      ],
    }),
  ]);
