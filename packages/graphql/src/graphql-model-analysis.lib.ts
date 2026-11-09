import type { GraphqlModelDefinition, GraphqlModelField } from './graphql-model.types';
import type { ModelTypeReader } from './graphql-model-checker.lib';
import type { ModelMethod, ModelResolverInput } from './graphql-model-method.lib';
import { readModelMethods } from './graphql-model-method.lib';
import type { ModelOperation } from './graphql-model-operation.lib';
import { notAModelOperation, readModelOperation } from './graphql-model-operation.lib';
import { resolveOwnership } from './graphql-model-ownership.lib';
import type { Read } from './graphql-model-read.lib';

export type { ModelResolverInput } from './graphql-model-method.lib';

export type ModelAnalysis = {
  readonly models: Record<string, GraphqlModelDefinition>;
  readonly fields: Record<string, Record<string, GraphqlModelField>>;
  readonly modelResolvers: ReadonlySet<string>;
  readonly bindings: Record<string, Record<string, { resolver: string; method: string }>>;
};

type MethodRead = { readonly method: ModelMethod; readonly operation: Read<ModelOperation> };

/** @throws {Error} from graphql-model-analysis.lib.ts:fail */
function fail(reason: string): never {
  throw new Error(reason);
}

/**
 * A resolver class follows the model contract as soon as one of its methods involves a model;
 * then every method must be a model operation.
 *
 * @throws {Error} from graphql-model-analysis.lib.ts:fail
 */
const modelOperation = (
  { method, operation }: MethodRead,
  reader: ModelTypeReader,
): ModelOperation => {
  if (operation.kind === 'ok') return operation.value;
  const reason =
    operation.kind === 'rejected' ? operation.reason : notAModelOperation(method, reader);
  return fail(`${method.resolver}.${method.name}: ${reason}`);
};

const record = <T, U>(entries: ReadonlyMap<string, T>, map: (value: T) => U): Record<string, U> =>
  Object.fromEntries([...entries].map(([key, value]) => [key, map(value)]));

/**
 * Validates model resolvers against the model types they reference and produces the single
 * representation that both SDL rendering and the runtime manifest consume.
 *
 * @throws {Error} from graphql-model-analysis.lib.ts:fail
 */
export const analyzeGraphqlModels = (inputs: readonly ModelResolverInput[]): ModelAnalysis => {
  const classes = inputs.map((input) => {
    const reader: ModelTypeReader = { checker: input.checker, ts: input.ts };
    const reads = readModelMethods(input, reader).map((method) => ({
      method,
      operation: readModelOperation(method, reader),
    }));
    return { input, reader, reads };
  });
  const modelClasses = classes.filter(({ reads }) =>
    reads.some(({ operation }) => operation.kind !== 'absent'),
  );
  const operations = modelClasses.flatMap(({ reads, reader }) =>
    reads.map((read) => modelOperation(read, reader)),
  );
  const [first] = classes;
  if (!first) return { models: {}, fields: {}, bindings: {}, modelResolvers: new Set() };
  const contract = resolveOwnership(operations, first.reader);
  if (contract.kind === 'rejected') fail(contract.reason);
  const { models, fields } = contract.value;
  return {
    models: record(models, (definition) => definition),
    fields: record(fields, (owned) => record(owned, ({ field }) => field)),
    bindings: record(fields, (owned) => record(owned, ({ binding }) => binding)),
    modelResolvers: new Set(modelClasses.map(({ input }) => input.resolver)),
  };
};
