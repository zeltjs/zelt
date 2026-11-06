import DataLoader from 'dataloader';
import { match } from 'ts-pattern';
import type {
  GraphqlModelBinding,
  GraphqlModelDefinition,
  GraphqlModelField,
  GraphqlModelFields,
  GraphqlModelResultShape,
  GraphqlModels,
  GraphqlModelValue,
} from './graphql-model.types';

type Source = Readonly<Record<string, unknown>>;
type MethodResult = { readonly value: unknown };
type Invoke = (
  binding: GraphqlModelBinding,
  positionalArgs: readonly unknown[],
  args: Readonly<Record<string, unknown>>,
) => Promise<{ readonly value: unknown }>;
type Options = {
  readonly models: GraphqlModels;
  readonly modelFields: GraphqlModelFields;
  readonly invoke: Invoke;
};
type BatchFieldLoader = {
  readonly parents: Map<string, Source>;
  readonly loader: DataLoader<string, MethodResult>;
};
type Operation = {
  readonly options: Options;
  readonly providers: Map<string, DataLoader<string, Source | null>>;
  readonly fields: Map<string, BatchFieldLoader>;
};

/**
 * @throws {Error} from graphql-model-runtime.lib.ts:record
 */
const record = (value: unknown): Source => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('GraphQL model data must be an object');
  }
  return Object.fromEntries(Object.entries(value));
};

/**
 * @throws {Error} from graphql-model-runtime.lib.ts:identity
 */
const identity = (value: unknown): string => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('GraphQL model reference must be an object');
  }
  const id: unknown = Reflect.get(value, 'id');
  if (typeof id !== 'string') throw new Error('GraphQL model reference must have a string id');
  return id;
};

const matchesScalar = (value: unknown, name: 'string' | 'number' | 'boolean'): boolean =>
  typeof value === name &&
  (name !== 'number' || (typeof value === 'number' && Number.isFinite(value)));

const matchesValue = (value: unknown, descriptor: GraphqlModelValue): boolean =>
  match(descriptor)
    .with({ kind: 'opaque' }, () => true)
    .with({ kind: 'scalar' }, ({ name }) => matchesScalar(value, name))
    .with({ kind: 'nullable' }, ({ inner }) => value === null || matchesValue(value, inner))
    .with({ kind: 'optional' }, ({ inner }) => value === undefined || matchesValue(value, inner))
    .with(
      { kind: 'array' },
      ({ item }) =>
        Array.isArray(value) &&
        Array.from(value).every((entry: unknown) => matchesValue(entry, item)),
    )
    .exhaustive();

/**
 * @throws {Error} from graphql-model-runtime.lib.ts:completeMap
 */
const completeMap = (value: unknown, ids: readonly string[]): ReadonlyMap<unknown, unknown> => {
  if (!(value instanceof Map)) throw new Error('GraphQL model batch must return a Map');
  rejectPromiseMapValues(value.values());
  const requested = new Set(ids);
  if (
    value.size !== requested.size ||
    [...value.keys()].some((key: unknown) => typeof key !== 'string' || !requested.has(key))
  ) {
    throw new Error('GraphQL model batch Map must contain exactly the requested IDs');
  }
  return value;
};

/** @throws {Error} from graphql-model-runtime.lib.ts:rejectPromiseMapValues */
const rejectPromiseMapValues = (values: Iterable<unknown>): void => {
  let invalid = false;
  for (const value of values) {
    if (!(value instanceof Promise)) continue;
    invalid = true;
    // Surface the Map contract error after observing every invalid rejected Promise.
    void value.then(
      () => undefined,
      () => undefined,
    );
  }
  if (invalid) throw new Error('GraphQL batch Map values must not be Promises');
};

/**
 * @throws {Error} from graphql-model-runtime.lib.ts:validateSource
 */
const validateSource = (
  model: string,
  definition: GraphqlModelDefinition,
  id: string,
  value: unknown,
): Source | null => {
  if (value === null) return null;
  const source = record(value);
  if (identity(source) !== id)
    throw new Error(`GraphQL provider returned a mismatched id for ${model}`);
  const keys = new Set(Object.keys(source));
  for (const property of definition.properties) {
    if (!keys.has(property.name)) {
      if (property.optional) continue;
      throw new Error(`GraphQL provider omitted ${model}.${property.name}`);
    }
    if (!matchesValue(source[property.name], property.value))
      throw new Error(`GraphQL provider returned invalid ${model}.${property.name}`);
  }
  return source;
};

const project = (parent: Source, dependencies: readonly string[]): Source =>
  Object.fromEntries(
    dependencies
      .filter((key) => Object.getOwnPropertyDescriptor(parent, key) !== undefined)
      .map((key) => [key, parent[key]]),
  );

const schedule = (callback: () => void): void => {
  setTimeout(callback, 0);
};

/**
 * @throws {Error} from graphql-model-runtime.lib.ts:provider
 */
const provider = (operation: Operation, model: string): DataLoader<string, Source | null> => {
  const existing = operation.providers.get(model);
  if (existing) return existing;
  const definition = operation.options.models[model];
  if (!definition) throw new Error(`GraphQL model provider missing: ${model}`);
  const loader = new DataLoader<string, Source | null>(
    async (ids) => {
      if (definition.mode === 'single') {
        return Promise.all(
          ids.map(async (id) => {
            const result = await operation.options.invoke(definition.provider, [{ id }], {});
            return validateSource(model, definition, id, await result.value);
          }),
        );
      }
      const result = await operation.options.invoke(
        definition.provider,
        [ids.map((id) => ({ id }))],
        {},
      );
      const values = completeMap(await result.value, ids);
      return ids.map((id) => validateSource(model, definition, id, values.get(id)));
    },
    { batch: definition.mode === 'batch', batchScheduleFn: schedule },
  );
  operation.providers.set(model, loader);
  return loader;
};

/**
 * @throws {Error} from graphql-model-runtime.lib.ts:hydrateOne
 */
const hydrateOne = async (
  operation: Operation,
  target: string,
  value: unknown,
  nullable: boolean,
): Promise<Source | null> => {
  if (value === null && nullable) return null;
  const source = await provider(operation, target).load(identity(value));
  if (source === null && !nullable) throw new Error(`GraphQL required model is missing: ${target}`);
  return source;
};

/**
 * @throws {Error} from graphql-model-runtime.lib.ts:hydrate
 */
const hydrate = (
  operation: Operation,
  target: string,
  value: unknown,
  shape: GraphqlModelResultShape,
): unknown => {
  if (shape.kind === 'one') return hydrateOne(operation, target, value, shape.nullable);
  if (value === null && shape.nullable) return null;
  if (!Array.isArray(value)) throw new Error('GraphQL model reference list must be an array');
  return Array.from(value, (item: unknown) =>
    hydrateOne(operation, target, item, shape.itemNullable),
  );
};

/**
 * @throws {Error} from graphql-model-runtime.lib.ts:field
 */
const field = (operation: Operation, typeName: string, fieldName: string): GraphqlModelField => {
  const descriptor = operation.options.modelFields[typeName]?.[fieldName];
  if (!descriptor) throw new Error(`GraphQL model field missing: ${typeName}.${fieldName}`);
  return descriptor;
};

const isReferenceObject = (value: unknown): boolean =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  typeof Reflect.get(value, 'id') === 'string';

// Preserve reference extras while accepting Promise-compatible query implementations.
const referenceResult = async (
  result: MethodResult,
  shape: GraphqlModelResultShape,
): Promise<MethodResult> => {
  const value = result.value;
  if (value instanceof Promise) return { value: await value };
  const immediate = shape.kind === 'many' ? Array.isArray(value) : isReferenceObject(value);
  if (value === null || immediate) return result;
  return { value: await value };
};

const batchField = (
  operation: Operation,
  key: string,
  binding: GraphqlModelBinding,
  args: Readonly<Record<string, unknown>>,
): BatchFieldLoader => {
  const existing = operation.fields.get(key);
  if (existing) return existing;
  const parents = new Map<string, Source>();
  const loader = new DataLoader<string, MethodResult>(
    async (ids) => {
      const inputs = ids.map((id) => {
        const selected = parents.get(id);
        if (!selected) throw new Error('GraphQL batch field parent missing');
        return selected;
      });
      const result = await operation.options.invoke(binding, [inputs], args);
      const values = completeMap(await result.value, ids);
      return ids.map((id) => ({ value: values.get(id) }));
    },
    { batchScheduleFn: schedule },
  );
  const entry = { parents, loader };
  operation.fields.set(key, entry);
  return entry;
};

/**
 * @throws {Error} from graphql-model-runtime.lib.ts:resolveField
 */
const resolveField = async (
  operation: Operation,
  typeName: string,
  fieldName: string,
  binding: GraphqlModelBinding,
  parent: unknown,
  args: Readonly<Record<string, unknown>>,
): Promise<unknown> => {
  const descriptor = field(operation, typeName, fieldName);
  if (descriptor.kind === 'query')
    throw new Error('GraphQL model field binding has the wrong kind');
  const source = record(parent);
  const input = project(source, descriptor.dependencies);
  const result =
    descriptor.mode === 'single'
      ? await operation.options.invoke(binding, [input], args)
      : await loadBatchField(operation, `${typeName}.${fieldName}`, binding, args, source, input);
  if (descriptor.kind === 'computed') return result.value;
  const resolved =
    descriptor.mode === 'single' ? await referenceResult(result, descriptor.shape) : result;
  return hydrate(operation, descriptor.target, resolved.value, descriptor.shape);
};

/** @throws {Error} from graphql-model-runtime.lib.ts:loadBatchField */
const loadBatchField = async (
  operation: Operation,
  key: string,
  binding: GraphqlModelBinding,
  args: Readonly<Record<string, unknown>>,
  source: Source,
  input: Source,
): Promise<MethodResult> => {
  const entry = batchField(operation, key, binding, args);
  const id = identity(source);
  entry.parents.set(id, input);
  return entry.loader.load(id);
};

/** Creates loaders whose lifetime is exactly one GraphQL operation. */
export const createGraphqlModelExecution = (options: Options) => {
  const operation: Operation = { options, providers: new Map(), fields: new Map() };
  return {
    resolveQuery: async (
      typeName: string,
      fieldName: string,
      binding: GraphqlModelBinding,
      args: Readonly<Record<string, unknown>>,
    ): Promise<unknown> => {
      const descriptor = field(operation, typeName, fieldName);
      if (descriptor.kind !== 'query')
        throw new Error('GraphQL model query binding has the wrong kind');
      const result = await options.invoke(binding, [], args);
      const resolved = await referenceResult(result, descriptor.shape);
      return hydrate(operation, descriptor.target, resolved.value, descriptor.shape);
    },
    resolveField: (
      typeName: string,
      fieldName: string,
      binding: GraphqlModelBinding,
      parent: unknown,
      args: Readonly<Record<string, unknown>>,
    ): Promise<unknown> => resolveField(operation, typeName, fieldName, binding, parent, args),
  };
};
