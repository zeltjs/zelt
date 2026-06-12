import type {
  ControllerClass,
  FeatureRuntime,
  HttpMountableCapabilities,
  HttpMountableFeatureModule,
  HttpStaticCapabilities,
} from '@zeltjs/core';
import { body, Controller, http, Post } from '@zeltjs/core';
import * as v from 'valibot';

import type { GraphqlResolverClass } from './graphql-metadata.lib';
import { setGraphqlControllerMetadata } from './graphql-metadata.lib';
import {
  createGraphqlExecutor,
  getGraphqlRuntimeState,
  graphqlRequestPayloadSchema,
  loadGeneratedGraphqlRuntime,
  setGraphqlRuntimeState,
} from './graphql-runtime.lib';

export type GraphqlOptions = {
  readonly path: string;
  readonly resolvers: readonly GraphqlResolverClass[];
  readonly runtimeModule?: string;
};

export type GraphqlChildOptions = HttpMountableFeatureModule;

/** @throws {Error} */
const createResolverLookup = (instances: ReadonlyMap<string, object>) => {
  return (resolver: GraphqlResolverClass): object => {
    const instance = instances.get(resolver.name);
    if (!instance) {
      throw new Error(`GraphQL resolver instance not found: ${resolver.name}`);
    }
    return instance;
  };
};

/** @throws {Error} */
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

export class GraphqlHttpFeature implements HttpMountableFeatureModule {
  readonly path: string;
  private readonly controller: ControllerClass;

  /** @throws {E | Error} */
  constructor(private readonly options: GraphqlOptions) {
    this.path = options.path;
    const GraphqlEndpointController = this.createController();
    this.controller = GraphqlEndpointController;
    setGraphqlControllerMetadata(GraphqlEndpointController, {
      resolvers: options.resolvers,
      ...(options.runtimeModule ? { runtimeModule: options.runtimeModule } : {}),
    });
  }

  readonly featureClasses = (): readonly ControllerClass[] => [
    this.controller,
    ...this.options.resolvers,
  ];

  readonly staticCapabilities = (): HttpStaticCapabilities => {
    return http({ path: this.path, controllers: [this.controller] }).staticCapabilities();
  };

  readonly createCapabilities = async (
    runtimeContext: FeatureRuntime,
  ): Promise<HttpMountableCapabilities> => {
    if (this.options.runtimeModule) {
      const generatedRuntime = await loadGeneratedGraphqlRuntime(this.options.runtimeModule);
      const resolverInstances = new Map<string, object>();
      for (const resolver of this.options.resolvers) {
        resolverInstances.set(resolver.name, await runtimeContext.get(resolver));
      }
      setGraphqlRuntimeState(this.controller, {
        execute: createGraphqlExecutor({
          runtime: generatedRuntime,
          resolvers: this.options.resolvers,
          resolveResolver: createResolverLookup(resolverInstances),
        }),
      });
    }

    return http({ path: this.path, controllers: [this.controller] }).createCapabilities(
      runtimeContext,
    );
  };

  /** @throws {E | Error} */
  private createController(): ControllerClass {
    class GraphqlEndpointController {
      /** @throws {Error} */
      async handle(): Promise<Response> {
        const state = getGraphqlRuntimeState(GraphqlEndpointController);
        if (!state) {
          return Response.json(
            { errors: [{ message: 'GraphQL generated runtime is not configured.' }] },
            { status: 501 },
          );
        }

        const payload = v.safeParse(graphqlRequestPayloadSchema, body());
        if (!payload.success) {
          return Response.json(
            { errors: [{ message: 'GraphQL request body must include a query string.' }] },
            { status: 400 },
          );
        }

        const result = await state.execute(payload.output);

        return Response.json(result);
      }
    }

    applyLegacyMethodDecorator(Post('/'), GraphqlEndpointController.prototype, 'handle');
    Controller('/')(GraphqlEndpointController);
    return GraphqlEndpointController;
  }
}

export const graphql = (options: GraphqlOptions): GraphqlChildOptions =>
  new GraphqlHttpFeature(options);
