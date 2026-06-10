import type { HttpChildOptions } from '@zeltjs/core';
import { body, Controller, Post } from '@zeltjs/core';

import type { GraphqlResolverClass } from './graphql.metadata';
import { setGraphqlControllerMetadata } from './graphql.metadata';
import {
  executeGraphqlRequest,
  getGraphqlRuntimeState,
  isGraphqlRequestPayload,
  loadGeneratedGraphqlRuntime,
  setGraphqlRuntimeState,
} from './graphql-runtime.lib';

export type GraphqlOptions = {
  readonly resolvers: readonly GraphqlResolverClass[];
  readonly runtimeModule?: string;
};

export type GraphqlChildOptions = HttpChildOptions;

const createResolverLookup = (instances: ReadonlyMap<string, object>) => {
  return (resolver: GraphqlResolverClass): object => {
    const instance = instances.get(resolver.name);
    if (!instance) {
      throw new Error(`GraphQL resolver instance not found: ${resolver.name}`);
    }
    return instance;
  };
};

const applyLegacyMethodDecorator = (
  decorator: MethodDecorator,
  target: object,
  propertyKey: string,
): void => {
  const descriptor = Object.getOwnPropertyDescriptor(target, propertyKey);
  if (!descriptor) {
    throw new Error(`Missing method descriptor: ${propertyKey}`);
  }
  decorator(target, propertyKey, descriptor);
};

export const graphql = (path: string, options: GraphqlOptions): GraphqlChildOptions => {
  class GraphqlEndpointController {
    async handle(): Promise<Response> {
      const state = getGraphqlRuntimeState(GraphqlEndpointController);
      if (!state) {
        return Response.json(
          { errors: [{ message: 'GraphQL generated runtime is not configured.' }] },
          { status: 501 },
        );
      }

      const payload = body();
      if (!isGraphqlRequestPayload(payload)) {
        return Response.json(
          { errors: [{ message: 'GraphQL request body must include a query string.' }] },
          { status: 400 },
        );
      }

      const result = await executeGraphqlRequest({
        runtime: state.runtime,
        resolvers: options.resolvers,
        resolveResolver: state.resolveResolver,
        request: payload,
      });

      return Response.json(result);
    }
  }

  applyLegacyMethodDecorator(Post('/'), GraphqlEndpointController.prototype, 'handle');
  Controller('/')(GraphqlEndpointController);
  setGraphqlControllerMetadata(GraphqlEndpointController, {
    resolvers: options.resolvers,
    ...(options.runtimeModule ? { runtimeModule: options.runtimeModule } : {}),
  });

  return {
    path,
    controllers: [GraphqlEndpointController],
    ...(options.runtimeModule
      ? {
          runtimeInitializers: [
            {
              name: 'graphql',
              initialize: async (context) => {
                const runtime = await loadGeneratedGraphqlRuntime(options.runtimeModule ?? '');
                const resolverInstances = new Map<string, object>();
                for (const resolver of options.resolvers) {
                  resolverInstances.set(resolver.name, await context.get(resolver));
                }
                setGraphqlRuntimeState(GraphqlEndpointController, {
                  runtime,
                  resolveResolver: createResolverLookup(resolverInstances),
                });
              },
            },
          ],
        }
      : {}),
  };
};
