import { AsyncLocalStorage } from 'node:async_hooks';

import type { StandardSchemaV1 } from '@standard-schema/spec';

export type StandardSchemaIssue = StandardSchemaV1.Issue;

export class GraphqlArgsValidationError extends Error {
  constructor(readonly issues: readonly StandardSchemaIssue[]) {
    super(`GraphQL args validation failed: ${issues.map((issue) => issue.message).join('; ')}`);
    this.name = 'GraphqlArgsValidationError';
  }
}

const graphqlArgsStorage = new AsyncLocalStorage<Readonly<Record<string, unknown>>>();

const isThenable = (value: unknown): boolean => {
  if (value === null) return false;
  const valueType = typeof value;
  if (valueType !== 'object' && valueType !== 'function') return false;
  return typeof Reflect.get(Object(value), 'then') === 'function';
};

export const runWithGraphqlArgs = <T>(args: Readonly<Record<string, unknown>>, fn: () => T): T =>
  graphqlArgsStorage.run(args, fn);

/** @throws {Error} */
const getGraphqlArgsContext = (): Readonly<Record<string, unknown>> => {
  const rawArgs = graphqlArgsStorage.getStore();
  if (rawArgs === undefined) {
    throw new Error(
      'args() requires a GraphQL args context; call it only as a resolver method default parameter.',
    );
  }
  return rawArgs;
};

/**
 * @internal Used by generated schema-first field helpers.
 * @throws {Error}
 */
export const readGraphqlArgs = <Output extends Readonly<Record<string, unknown>>>(): Output =>
  narrowGraphqlArgs<Output>(getGraphqlArgsContext());

function narrowGraphqlArgs<Output>(args: Readonly<Record<string, unknown>>): Output;
function narrowGraphqlArgs(args: Readonly<Record<string, unknown>>): unknown {
  return args;
}

/** @throws {GraphqlArgsValidationError | Error} */
export const validateGraphqlArgs = <Schema extends StandardSchemaV1>(
  schema: Schema,
): StandardSchemaV1.InferOutput<Schema> => {
  const rawArgs = getGraphqlArgsContext();

  const result = schema['~standard'].validate(rawArgs);
  if (result instanceof Promise || isThenable(result)) {
    throw new Error('args() does not support async validation schemas.');
  }
  if (result.issues) {
    throw new GraphqlArgsValidationError(result.issues);
  }
  return result.value;
};

/** @throws {GraphqlArgsValidationError | Error} */
export const args = <Schema extends StandardSchemaV1>(
  schema: Schema,
): StandardSchemaV1.InferOutput<Schema> => validateGraphqlArgs(schema);
