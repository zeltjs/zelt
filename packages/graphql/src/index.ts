/**
 * Experimental GraphQL support for Zelt.
 *
 * The runtime manifest shape and generated helper APIs may change before a
 * stable release. Prefer the app-authoring APIs documented in the package
 * README for application code.
 */
export type { StandardSchemaV1 } from '@standard-schema/spec';
export type { StandardSchemaIssue } from './args.lib';
export {
  args,
  GraphqlArgsValidationError,
  readGraphqlArgs,
  runWithGraphqlArgs,
  validateGraphqlArgs,
} from './args.lib';
export type { AnyGqlScalar, GqlOutput, GqlScalar, GqlScalarCodec } from './gql-scalar.lib';
export { gqlScalar, isGqlScalar } from './gql-scalar.lib';
export { Mutation, Query, ResolveField, Resolver } from './graphql.decorator';
export type { GraphqlChildOptions, GraphqlOptions } from './graphql-child.lib';
export { graphql } from './graphql-child.lib';
export type {
  GraphqlOperationKind,
  GraphqlOperationMetadata,
  GraphqlResolverClass,
  GraphqlResolverMetadata,
} from './graphql-metadata.lib';
export type {
  CreateGraphqlExecutorOptions,
  ExecuteGraphqlRequestOptions,
  GeneratedGraphqlBinding,
  GeneratedGraphqlRuntime,
  GraphqlExecutor,
  GraphqlRequestPayload,
  GraphqlRuntimeLoader,
  GraphqlRuntimeManifest,
  GraphqlRuntimeSource,
} from './graphql-runtime.lib';
export {
  createGraphqlExecutor,
  executeGraphqlRequest,
  graphqlRequestPayloadSchema,
} from './graphql-runtime.lib';
