import { AsyncLocalStorage } from 'node:async_hooks';

// Vendored Standard Schema v1 interface (https://standardschema.dev). The spec
// is types-only by design; vendoring keeps the runtime free of validator
// dependencies so valibot, zod, and others work without an adapter.
export type StandardSchemaV1<Output = unknown> = {
  readonly '~standard': {
    version: 1;
    readonly vendor: string;
    readonly validate: (
      value: unknown,
    ) => StandardSchemaResult<Output> | Promise<StandardSchemaResult<Output>>;
  };
};

export type StandardSchemaIssue = {
  readonly message: string;
  readonly path?: readonly (PropertyKey | { readonly key: PropertyKey })[] | undefined;
};

type StandardSchemaResult<Output> =
  | { readonly value: Output; issues?: undefined }
  | { readonly issues: readonly StandardSchemaIssue[] };

export class GraphqlArgsValidationError extends Error {
  constructor(readonly issues: readonly StandardSchemaIssue[]) {
    super(`GraphQL args validation failed: ${issues.map((issue) => issue.message).join('; ')}`);
    this.name = 'GraphqlArgsValidationError';
  }
}

const graphqlArgsStorage = new AsyncLocalStorage<Readonly<Record<string, unknown>>>();

export const runWithGraphqlArgs = <T>(args: Readonly<Record<string, unknown>>, fn: () => T): T =>
  graphqlArgsStorage.run(args, fn);

// Async validation schemas (e.g. zod async refinements) are not supported:
// default parameter initializers must produce the value synchronously, so an
// async schema fails at runtime with an explicit error.
/** @throws {GraphqlArgsValidationError | Error} */
export const gqlValidated = <Output>(schema: StandardSchemaV1<Output>): Output => {
  const args = graphqlArgsStorage.getStore();
  if (args === undefined) {
    throw new Error(
      'gqlValidated() requires a GraphQL args context; call it only as a resolver method default parameter.',
    );
  }

  const result = schema['~standard'].validate(args);
  if (result instanceof Promise) {
    throw new Error('gqlValidated() does not support async validation schemas.');
  }
  if (result.issues) {
    throw new GraphqlArgsValidationError(result.issues);
  }
  return result.value;
};
