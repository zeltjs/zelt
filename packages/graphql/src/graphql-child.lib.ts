import type {
  ControllerClass,
  HttpMountableCapabilities,
  HttpMountableFeatureModule,
  HttpStaticCapabilities,
  ServiceResolver,
} from '@zeltjs/core';
import { Controller, http, Post, request } from '@zeltjs/core';

import type { GraphqlResolverClass } from './graphql-metadata.lib';
import { setGraphqlControllerMetadata } from './graphql-metadata.lib';
import type {
  GeneratedGraphqlRuntime,
  GraphqlRuntimeLoader,
  GraphqlRuntimeSource,
} from './graphql-runtime.lib';
import {
  createGraphqlExecutor,
  getGraphqlRuntimeState,
  loadGeneratedGraphqlRuntime,
  parseGraphqlRequestPayload,
  setGraphqlRuntimeState,
} from './graphql-runtime.lib';

type GraphqlBaseOptions = {
  readonly path: string;
  readonly resolvers: readonly GraphqlResolverClass[];
  /** Build-time output path consumed by graphqlPlugin(). */
  readonly runtimeModule?: string;
};

export type GraphqlOptions = GraphqlBaseOptions &
  (
    | { readonly runtime: GeneratedGraphqlRuntime; readonly runtimeLoader?: never }
    | { readonly runtime?: never; readonly runtimeLoader: GraphqlRuntimeLoader }
    /** @deprecated Prefer runtime or runtimeLoader for portable runtime loading. */
    | { readonly runtime?: never; readonly runtimeLoader?: never; readonly runtimeModule: string }
  );

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
    this.validateUniqueResolverNames(options.resolvers);
    const GraphqlEndpointController = this.createController();
    this.controller = GraphqlEndpointController;
    setGraphqlControllerMetadata(GraphqlEndpointController, {
      resolvers: options.resolvers,
      ...(options.runtimeModule !== undefined && { runtimeModule: options.runtimeModule }),
    });
  }

  /** @throws {Error} */
  private validateUniqueResolverNames(resolvers: readonly GraphqlResolverClass[]): void {
    const seen = new Set<string>();
    for (const resolver of resolvers) {
      if (seen.has(resolver.name)) {
        throw new Error(`Duplicate GraphQL resolver class name: ${resolver.name}`);
      }
      seen.add(resolver.name);
    }
  }

  readonly featureClasses = (): readonly ControllerClass[] => [
    this.controller,
    ...this.options.resolvers,
  ];

  readonly blueprint = (): HttpStaticCapabilities => {
    return http({ path: this.path, controllers: [this.controller] }).blueprint();
  };

  readonly realize = async (
    runtimeContext: ServiceResolver,
  ): Promise<HttpMountableCapabilities> => {
    const generatedRuntime = await loadGeneratedGraphqlRuntime(this.runtimeSource());
    const resolverInstances = new Map<string, object>();
    for (const resolver of this.options.resolvers) {
      resolverInstances.set(resolver.name, await runtimeContext.get(resolver));
    }
    // State is keyed by the per-runtime controller instance (not the
    // controller class) so multiple runtimes created from the same app
    // definition keep their own resolver instances.
    setGraphqlRuntimeState(await runtimeContext.get(this.controller), {
      execute: createGraphqlExecutor({
        runtime: generatedRuntime,
        resolvers: this.options.resolvers,
        resolveResolver: createResolverLookup(resolverInstances),
      }),
    });

    return http({ path: this.path, controllers: [this.controller] }).realize(runtimeContext);
  };

  private runtimeSource(): GraphqlRuntimeSource {
    if (this.options.runtime) return this.options.runtime;
    if (this.options.runtimeLoader) return this.options.runtimeLoader;
    return this.options.runtimeModule;
  }

  /** @throws {E | Error} */
  private createController(): ControllerClass {
    class GraphqlEndpointController {
      /** @throws {Error} */
      async handle(req = request()): Promise<Response> {
        const state = getGraphqlRuntimeState(this);
        if (!state) {
          return Response.json(
            { errors: [{ message: 'GraphQL generated runtime is not configured.' }] },
            { status: 501 },
          );
        }

        const payload = parseGraphqlRequestPayload(await req.body());
        if (!payload) {
          return Response.json(
            { errors: [{ message: 'GraphQL request body must include a query string.' }] },
            { status: 400 },
          );
        }

        const result = await state.execute(payload);

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
