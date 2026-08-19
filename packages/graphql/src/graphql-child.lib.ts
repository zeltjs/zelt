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
import type { GeneratedGraphqlRuntime } from './graphql-runtime.lib';
import {
  createGraphqlExecutor,
  getGraphqlRuntimeState,
  parseGraphqlPrebuiltEntry,
  parseGraphqlRequestPayload,
  setGraphqlRuntimeState,
} from './graphql-runtime.lib';
import { computeGraphqlPrebuiltHash } from './prebuilt-hash.lib';

// The default key ('graphql') mirrors HTTP_FEATURE_KEY in
// packages/core/src/features/http/http.feature.ts: a single unnamed instance
// is the common case, and multiple endpoints disambiguate via `name`.
export const GRAPHQL_FEATURE_KEY = 'graphql' as const;

export type GraphqlOptions = {
  readonly path: string;
  readonly resolvers: readonly GraphqlResolverClass[];
  readonly name?: string;
};

export type GraphqlChildOptions = HttpMountableFeatureModule;

const toObject = (value: unknown): object | undefined => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  return value;
};

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
  readonly key: string;
  private readonly controller: ControllerClass;

  /** @throws {E | Error} */
  constructor(private readonly options: GraphqlOptions) {
    this.path = options.path;
    this.key = options.name ?? GRAPHQL_FEATURE_KEY;
    this.validateUniqueResolverNames(options.resolvers);
    const GraphqlEndpointController = this.createController();
    this.controller = GraphqlEndpointController;
    setGraphqlControllerMetadata(GraphqlEndpointController, {
      key: this.key,
      path: options.path,
      resolvers: options.resolvers,
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
    const generatedRuntime = await this.resolveGraphqlRuntime(runtimeContext);
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

  /** @throws {Error} */
  private async resolveGraphqlRuntime(
    runtimeContext: ServiceResolver,
  ): Promise<GeneratedGraphqlRuntime> {
    const prebuilt = runtimeContext.prebuilt;
    if (!prebuilt) {
      throw new Error(
        'GraphQL requires a prebuilt module. Run `zelt build` and pass it to the adapter: onNode(app, { prebuilt: zeltPrebuilt })',
      );
    }
    const graphqlFeature = toObject(prebuilt.features[GRAPHQL_FEATURE_KEY]);
    const entry = parseGraphqlPrebuiltEntry(
      graphqlFeature ? Reflect.get(graphqlFeature, this.key) : undefined,
    );
    if (!entry) {
      throw new Error(
        `No GraphQL prebuilt entry for key "${this.key}". It may not have been generated yet, or the prebuilt is stale. Run \`zelt build\`.`,
      );
    }
    // The lookup key identifies the endpoint; resolversHash guards against
    // the resolver set having changed since the entry was generated.
    const expectedHash = await computeGraphqlPrebuiltHash(this.path, this.options.resolvers);
    if (entry.resolversHash !== expectedHash) {
      throw new Error(
        `GraphQL prebuilt entry for key "${this.key}" is stale. Run \`zelt build\` again.`,
      );
    }
    return entry.runtime;
  }

  /** @throws {E | Error} */
  private createController(): ControllerClass {
    class GraphqlEndpointController {
      /** @throws {Error} */
      async handle(req = request()): Promise<Response> {
        const state = getGraphqlRuntimeState(this);
        if (!state) {
          throw new Error(
            'GraphQL runtime state missing after realize(); this is a bug in @zeltjs/graphql.',
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
