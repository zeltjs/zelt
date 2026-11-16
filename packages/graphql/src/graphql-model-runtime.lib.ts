import DataLoader from 'dataloader';
import { match } from 'ts-pattern';
import type {
  GraphqlModelBinding,
  GraphqlModelDefinition,
  GraphqlModelField,
  GraphqlModelFields,
  GraphqlModelResultShape,
  GraphqlModelScalar,
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
  readonly bindings: Readonly<Record<string, Readonly<Record<string, GraphqlModelBinding>>>>;
  readonly invoke: Invoke;
};
type BatchFieldLoader = {
  readonly parents: Map<string, Source>;
  readonly loader: DataLoader<string, MethodResult>;
};
/** A model reference as GraphQL carries it; every other property is read on demand. */
type Handle = { readonly id: string };
/** `present: false` keeps an omitted optional property apart from an explicit `undefined`. */
type Slot = { readonly present: boolean; readonly value: unknown };
type Operation = {
  readonly options: Options;
  readonly providers: Map<string, DataLoader<string, Source>>;
  readonly fields: Map<string, BatchFieldLoader>;
  readonly properties: Map<string, Promise<Slot>>;
};

/**
 * @throws {Error} from graphql-model-runtime.lib.ts:record
 */
const record = (value: unknown, properties: readonly string[] = []): Source => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('GraphQL model data must be an object');
  }
  const keys = new Set([
    ...Object.keys(value),
    ...properties.filter((key) => Reflect.has(value, key)),
  ]);
  return Object.fromEntries([...keys].map((key) => [key, Reflect.get(value, key)]));
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

const matchesScalar = (value: unknown, name: GraphqlModelScalar): boolean =>
  match(name)
    .with('ID', 'string', () => typeof value === 'string')
    .with('number', () => typeof value === 'number' && Number.isFinite(value))
    .with('boolean', () => typeof value === 'boolean')
    .exhaustive();

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

/** @throws {Error} from graphql-model-runtime.lib.ts:nativeMap */
const nativeMap = (value: unknown): ReadonlyMap<unknown, unknown> => {
  if (value instanceof Map) return value;
  const entries = new Map<unknown, unknown>();
  try {
    Map.prototype.forEach.call(value, (entry: unknown, key: unknown) => {
      entries.set(key, entry);
    });
  } catch {
    throw new Error('GraphQL model batch must return a Map');
  }
  return entries;
};

/**
 * @throws {Error} from graphql-model-runtime.lib.ts:completeMap
 */
const completeMap = (value: unknown, ids: readonly string[]): ReadonlyMap<unknown, unknown> => {
  const entries = nativeMap(value);
  rejectPromiseMapValues(entries.values());
  // Keys beyond the requested ids are never read, so only missing ids break the contract.
  if (ids.some((id) => !entries.has(id))) {
    throw new Error('GraphQL model batch Map must contain every requested ID');
  }
  return entries;
};

// Calling the intrinsic observes native promises without touching reference extras such as `then`.
const observeNativePromise = (value: unknown): boolean => {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) return false;
  try {
    return Boolean(
      Promise.prototype.then.call(
        value,
        () => undefined,
        () => undefined,
      ),
    );
  } catch {
    return false;
  }
};

/** @throws {Error} from graphql-model-runtime.lib.ts:rejectPromiseMapValues */
const rejectPromiseMapValues = (values: Iterable<unknown>): void => {
  let invalid = false;
  for (const value of values) {
    if (observeNativePromise(value)) invalid = true;
  }
  if (invalid) throw new Error('GraphQL batch Map values must not be Promises');
};

/**
 * An id is a promise that its model exists, so a provider without data breaks the contract.
 * @throws {Error} from graphql-model-runtime.lib.ts:requireData
 */
const requireData = (model: string, value: unknown): unknown => {
  if (value === null || value === undefined)
    throw new Error(`GraphQL provider returned no data for a requested ${model} id`);
  return value;
};

/**
 * @throws {Error} from graphql-model-runtime.lib.ts:validateSource
 */
const validateSource = (
  model: string,
  definition: Extract<GraphqlModelDefinition, { kind: 'provided' }>,
  id: string,
  value: unknown,
): Source => {
  const row = record(
    requireData(model, value),
    definition.properties.map((property) => property.name),
  );
  // Returning the id is optional; when present it must still be the requested one.
  if (Object.getOwnPropertyDescriptor(row, 'id') !== undefined && identity(row) !== id)
    throw new Error(`GraphQL provider returned a mismatched id for ${model}`);
  const source: Source = { ...row, id };
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

/** One invalid row fails only its own id; DataLoader rejects the keys whose value is an Error. */
const validateRow = (
  model: string,
  definition: Extract<GraphqlModelDefinition, { kind: 'provided' }>,
  id: string,
  value: unknown,
): Source | Error => {
  try {
    return validateSource(model, definition, id, value);
  } catch (error) {
    if (error instanceof Error) return error;
    throw error;
  }
};

const schedule = (callback: () => void): void => {
  setTimeout(callback, 0);
};

/**
 * @throws {Error} from graphql-model-runtime.lib.ts:provider
 */
const provider = (
  operation: Operation,
  model: string,
  definition: Extract<GraphqlModelDefinition, { kind: 'provided' }>,
): DataLoader<string, Source> => {
  const existing = operation.providers.get(model);
  if (existing) return existing;
  const loader = new DataLoader<string, Source>(
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
      return ids.map((id) => validateRow(model, definition, id, values.get(id)));
    },
    { batch: definition.mode === 'batch', batchScheduleFn: schedule },
  );
  operation.providers.set(model, loader);
  return loader;
};

/**
 * Async so that an invalid list element fails only at its own GraphQL path.
 * @throws {Error} from graphql-model-runtime.lib.ts:hydrateOne
 */
const hydrateOne = async (value: unknown, nullable: boolean): Promise<Handle | null> => {
  if (value === null && nullable) return null;
  return { id: identity(value) };
};

/**
 * Hands GraphQL only ids; their properties are resolved when a selection or dependency asks.
 * @throws {Error} from graphql-model-runtime.lib.ts:hydrate
 */
const hydrate = (value: unknown, shape: GraphqlModelResultShape): unknown => {
  if (shape.kind === 'one') return hydrateOne(value, shape.nullable);
  if (value === null && shape.nullable) return null;
  if (!Array.isArray(value)) throw new Error('GraphQL model reference list must be an array');
  return Array.from(value, (item: unknown) => hydrateOne(item, shape.itemNullable));
};

/**
 * @throws {Error} from graphql-model-runtime.lib.ts:field
 */
const field = (operation: Operation, typeName: string, fieldName: string): GraphqlModelField => {
  const descriptor = operation.options.modelFields[typeName]?.[fieldName];
  if (!descriptor) throw new Error(`GraphQL model field missing: ${typeName}.${fieldName}`);
  return descriptor;
};

/**
 * @throws {Error} from graphql-model-runtime.lib.ts:bindingOf
 */
const bindingOf = (operation: Operation, typeName: string, fieldName: string) => {
  const binding = operation.options.bindings[typeName]?.[fieldName];
  if (!binding) throw new Error(`GraphQL model field binding missing: ${typeName}.${fieldName}`);
  return binding;
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

/** @throws {Error} from graphql-model-runtime.lib.ts:invokeField */
const invokeField = async (
  operation: Operation,
  typeName: string,
  fieldName: string,
  descriptor: Exclude<GraphqlModelField, { kind: 'query' }>,
  id: string,
  args: Readonly<Record<string, unknown>>,
): Promise<MethodResult> => {
  const binding = bindingOf(operation, typeName, fieldName);
  const input = await dependencies(operation, typeName, id, descriptor.dependencies);
  if (descriptor.mode === 'single') return operation.options.invoke(binding, [input], args);
  const entry = batchField(operation, `${typeName}.${fieldName}`, binding, args);
  entry.parents.set(id, input);
  return entry.loader.load(id);
};

const supplies = (definition: GraphqlModelDefinition, name: string): boolean =>
  definition.properties.some((property) => property.name === name);

/** @throws {Error} from graphql-model-runtime.lib.ts:readSupplied */
const readSupplied = async (
  operation: Operation,
  model: string,
  definition: Extract<GraphqlModelDefinition, { kind: 'provided' }>,
  id: string,
  name: string,
): Promise<Slot> => {
  const source = await provider(operation, model, definition).load(id);
  return Object.getOwnPropertyDescriptor(source, name) === undefined
    ? { present: false, value: undefined }
    : { present: true, value: source[name] };
};

/** @throws {Error} from graphql-model-runtime.lib.ts:computed */
const computed = (operation: Operation, model: string, name: string) => {
  const descriptor = operation.options.modelFields[model]?.[name];
  if (descriptor?.kind !== 'computed')
    throw new Error(`GraphQL model property has no resolver: ${model}.${name}`);
  return descriptor;
};

/** @throws {Error} from graphql-model-runtime.lib.ts:resolveProperty */
const resolveProperty = async (
  operation: Operation,
  model: string,
  id: string,
  name: string,
): Promise<Slot> => {
  if (name === 'id') return { present: true, value: id };
  const definition = operation.options.models[model];
  if (definition?.kind === 'provided' && supplies(definition, name))
    return readSupplied(operation, model, definition, id, name);
  const result = await invokeField(
    operation,
    model,
    name,
    computed(operation, model, name),
    id,
    {},
  );
  return { present: true, value: await result.value };
};

/**
 * Each property of one model id is resolved at most once per operation, whether a selection
 * or another field's dependency asked for it first.
 * @throws {Error} from graphql-model-runtime.lib.ts:readProperty
 */
const readProperty = (
  operation: Operation,
  model: string,
  id: string,
  name: string,
): Promise<Slot> => {
  const key = JSON.stringify([model, id, name]);
  const existing = operation.properties.get(key);
  if (existing) return existing;
  const pending = resolveProperty(operation, model, id, name);
  operation.properties.set(key, pending);
  return pending;
};

/** @throws {Error} from graphql-model-runtime.lib.ts:dependencies */
const dependencies = async (
  operation: Operation,
  model: string,
  id: string,
  names: readonly string[],
): Promise<Source> => {
  const slots = await Promise.all(names.map((name) => readProperty(operation, model, id, name)));
  return Object.fromEntries(
    names.flatMap((name, index) => (slots[index]?.present ? [[name, slots[index].value]] : [])),
  );
};

/** Creates loaders whose lifetime is exactly one GraphQL operation. */
export const createGraphqlModelExecution = (options: Options) => {
  const operation: Operation = {
    options,
    providers: new Map(),
    fields: new Map(),
    properties: new Map(),
  };
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
      return hydrate(resolved.value, descriptor.shape);
    },
    /** Resolves a model property for GraphQL: a supplied value, a computed field or a relation. */
    resolveField: async (
      typeName: string,
      fieldName: string,
      parent: unknown,
      args: Readonly<Record<string, unknown>>,
    ): Promise<unknown> => {
      const id = identity(parent);
      const descriptor = operation.options.modelFields[typeName]?.[fieldName];
      if (descriptor?.kind === 'query')
        throw new Error('GraphQL model field binding has the wrong kind');
      if (descriptor?.kind !== 'relation')
        return (await readProperty(operation, typeName, id, fieldName)).value;
      const result = await invokeField(operation, typeName, fieldName, descriptor, id, args);
      const resolved =
        descriptor.mode === 'single' ? await referenceResult(result, descriptor.shape) : result;
      return hydrate(resolved.value, descriptor.shape);
    },
  };
};
