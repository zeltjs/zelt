import { createApp, http } from '@zeltjs/core';
import { graphql } from '@zeltjs/graphql';

import { HealthController } from './entry/http/health.controller';
import { OrderFieldsResolver } from './graphql/order-fields.resolver';
import { StorefrontResolver } from './graphql/storefront.resolver';
import { StorefrontFieldsResolver } from './graphql/storefront-fields.resolver';
import { StorefrontMutationResolver } from './graphql/storefront-mutation.resolver';

export const graphqlRuntimeModule = 'src/generated/graphql-runtime.js';
const graphqlRuntimeImport = './generated/graphql-runtime.js';

const loadGraphqlRuntime = (): Promise<unknown> => import(/* @vite-ignore */ graphqlRuntimeImport);

export const createGraphqlDogfoodingApp = () =>
  createApp([
    http({
      path: '/api',
      controllers: [HealthController],
      children: [
        http({
          path: '/v1',
          children: [
            graphql({
              path: '/graphql',
              resolvers: [
                StorefrontResolver,
                StorefrontFieldsResolver,
                OrderFieldsResolver,
                StorefrontMutationResolver,
              ],
              runtimeLoader: loadGraphqlRuntime,
              runtimeModule: graphqlRuntimeModule,
            }),
          ],
        }),
      ],
    }),
  ]);
