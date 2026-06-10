export type GraphqlResolverClass = new (...args: never[]) => object;

export type GraphqlResolverMetadata = {
  readonly kind: 'resolver';
};

export type GraphqlOperationKind = 'query' | 'mutation' | 'resolveField';

export type GraphqlOperationMetadata = {
  readonly kind: GraphqlOperationKind;
};

export type GraphqlControllerMetadata = {
  readonly resolvers: readonly GraphqlResolverClass[];
  readonly runtimeModule?: string;
};

const resolverMetadata = new WeakMap<object, GraphqlResolverMetadata>();
const controllerMetadata = new WeakMap<object, GraphqlControllerMetadata>();

export const setResolverMetadata = (
  resolver: GraphqlResolverClass,
  metadata: GraphqlResolverMetadata,
): void => {
  resolverMetadata.set(resolver, metadata);
};

export const getResolverMetadata = (
  resolver: GraphqlResolverClass,
): GraphqlResolverMetadata | undefined => resolverMetadata.get(resolver);

export const setGraphqlControllerMetadata = (
  controller: object,
  metadata: GraphqlControllerMetadata,
): void => {
  controllerMetadata.set(controller, metadata);
};

export const getGraphqlControllerMetadata = (
  controller: object,
): GraphqlControllerMetadata | undefined => controllerMetadata.get(controller);
