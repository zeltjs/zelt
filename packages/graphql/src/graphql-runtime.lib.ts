import type { ExecutionResult, GraphQLSchema, ValidationRule } from 'graphql';
import {
  buildSchema,
  GraphQLError,
  GraphQLObjectType,
  GraphQLScalarType,
  GraphQLUnionType,
  graphql,
  parse,
  validate,
} from 'graphql';
import { GraphqlArgsValidationError, runWithGraphqlArgs } from './args.lib';
import type { AnyGqlScalar } from './gql-scalar.lib';
import { parseGqlScalar } from './gql-scalar.lib';
import type { GraphqlResolverClass } from './graphql-metadata.lib';

// GraphQL over HTTP clients (Apollo, GraphiQL, ...) commonly send explicit
// nulls for variables/operationName; both mean "not specified".
export const graphqlRequestPayloadSchema = {
  query: 'string',
  variables: 'record<string, unknown> | null | undefined',
  operationName: 'string | null | undefined',
} as const;

export type GeneratedGraphqlBinding = {
  readonly resolver: string;
  readonly method: string;
};

// GeneratedGraphqlRuntime is the runtime manifest consumed by the executor.
// Code-first generation is one producer. Schema-first generation can produce
// the same shape from SDL + resolver bindings.
export type GeneratedGraphqlRuntime = {
  readonly schemaSdl: string;
  readonly bindings: Record<string, Record<string, GeneratedGraphqlBinding>>;
  readonly enumFields?: Record<string, Record<string, Readonly<Record<string, string>>>>;
  readonly scalarRefs?: Record<
    string,
    { readonly modulePath: string; readonly exportName: string }
  >;
  readonly scalars?: Record<string, AnyGqlScalar>;
  readonly unions?: Record<string, Record<string, readonly string[]>>;
};

export type GraphqlRuntimeManifest = GeneratedGraphqlRuntime;

export type GraphqlRuntimeLoader = () => unknown | Promise<unknown>;

export type GraphqlRuntimeSource = GeneratedGraphqlRuntime | GraphqlRuntimeLoader | string;

export type GraphqlRequestPayload = {
  readonly query: string;
  readonly variables?: Readonly<Record<string, unknown>> | null;
  readonly operationName?: string | null;
};

export type CreateGraphqlExecutorOptions = {
  readonly runtime: GeneratedGraphqlRuntime;
  readonly resolvers: readonly GraphqlResolverClass[];
  readonly resolveResolver: (resolver: GraphqlResolverClass) => object | Promise<object>;
  readonly validationRules?: readonly import('graphql').ValidationRule[];
};

export type ExecuteGraphqlRequestOptions = CreateGraphqlExecutorOptions & {
  readonly request: GraphqlRequestPayload;
};

export type GraphqlExecutor = (request: GraphqlRequestPayload) => Promise<ExecutionResult>;

export type GraphqlRuntimeState = {
  readonly execute: GraphqlExecutor;
};

const runtimeRegistry = new WeakMap<object, GraphqlRuntimeState>();

export const setGraphqlRuntimeState = (controller: object, state: GraphqlRuntimeState): void => {
  runtimeRegistry.set(controller, state);
};

export const getGraphqlRuntimeState = (controller: object): GraphqlRuntimeState | undefined =>
  runtimeRegistry.get(controller);

const _isPlainObject = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toObject = (value: unknown): object | undefined => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  return value;
};

const readProperty = (value: object, key: string): unknown => Reflect.get(value, key);

const parseStringRecord = (value: unknown): Record<string, string> | undefined => {
  const record = toObject(value);
  if (!record) return undefined;
  const output: Record<string, string> = {};
  for (const [key, entry] of Object.entries(record)) {
    if (typeof entry !== 'string') return undefined;
    output[key] = entry;
  }
  return output;
};

const parseGeneratedGraphqlBinding = (value: unknown): GeneratedGraphqlBinding | undefined => {
  const record = toObject(value);
  if (!record) return undefined;
  const resolver = readProperty(record, 'resolver');
  const method = readProperty(record, 'method');
  if (typeof resolver !== 'string' || typeof method !== 'string') return undefined;
  return { resolver, method };
};

const parseGeneratedGraphqlBindings = (
  value: unknown,
): GeneratedGraphqlRuntime['bindings'] | undefined => {
  const record = toObject(value);
  if (!record) return undefined;
  const output: GeneratedGraphqlRuntime['bindings'] = {};
  for (const [typeName, fieldsValue] of Object.entries(record)) {
    const fields = toObject(fieldsValue);
    if (!fields) return undefined;
    output[typeName] = {};
    for (const [fieldName, bindingValue] of Object.entries(fields)) {
      const binding = parseGeneratedGraphqlBinding(bindingValue);
      if (!binding) return undefined;
      output[typeName][fieldName] = binding;
    }
  }
  return output;
};

const parseRuntimeEnumFields = (
  value: unknown,
): NonNullable<GeneratedGraphqlRuntime['enumFields']> | undefined => {
  const record = toObject(value);
  if (!record) return undefined;
  const output: NonNullable<GeneratedGraphqlRuntime['enumFields']> = {};
  for (const [typeName, fieldsValue] of Object.entries(record)) {
    const fields = toObject(fieldsValue);
    if (!fields) return undefined;
    output[typeName] = {};
    for (const [fieldName, mappingValue] of Object.entries(fields)) {
      const mapping = parseStringRecord(mappingValue);
      if (!mapping) return undefined;
      output[typeName][fieldName] = mapping;
    }
  }
  return output;
};

const parseRuntimeScalarRefs = (
  value: unknown,
): NonNullable<GeneratedGraphqlRuntime['scalarRefs']> | undefined => {
  const record = toObject(value);
  if (!record) return undefined;
  const output: NonNullable<GeneratedGraphqlRuntime['scalarRefs']> = {};
  for (const [typeName, refValue] of Object.entries(record)) {
    const ref = toObject(refValue);
    if (!ref) return undefined;
    const modulePath = readProperty(ref, 'modulePath');
    const exportName = readProperty(ref, 'exportName');
    if (typeof modulePath !== 'string' || typeof exportName !== 'string') return undefined;
    output[typeName] = { modulePath, exportName };
  }
  return output;
};

const parseRuntimeScalars = (
  value: unknown,
): NonNullable<GeneratedGraphqlRuntime['scalars']> | undefined => {
  const record = toObject(value);
  if (!record) return undefined;
  const output: NonNullable<GeneratedGraphqlRuntime['scalars']> = {};
  for (const [typeName, scalarValue] of Object.entries(record)) {
    const scalar = parseGqlScalar(scalarValue);
    if (!scalar) return undefined;
    output[typeName] = scalar;
  }
  return output;
};

const parseStringArray = (value: unknown): readonly string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  return value.every((entry) => typeof entry === 'string') ? value : undefined;
};

const parseRuntimeUnions = (
  value: unknown,
): NonNullable<GeneratedGraphqlRuntime['unions']> | undefined => {
  const record = toObject(value);
  if (!record) return undefined;
  const output: NonNullable<GeneratedGraphqlRuntime['unions']> = {};
  for (const [typeName, membersValue] of Object.entries(record)) {
    const members = toObject(membersValue);
    if (!members) return undefined;
    output[typeName] = {};
    for (const [memberName, fieldsValue] of Object.entries(members)) {
      const fields = parseStringArray(fieldsValue);
      if (!fields) return undefined;
      output[typeName][memberName] = fields;
    }
  }
  return output;
};

const parseGeneratedGraphqlRuntimeBase = (
  record: object,
): Pick<GeneratedGraphqlRuntime, 'bindings' | 'schemaSdl'> | undefined => {
  const schemaSdl = readProperty(record, 'schemaSdl');
  if (typeof schemaSdl !== 'string') return undefined;
  const bindings = parseGeneratedGraphqlBindings(readProperty(record, 'bindings'));
  if (!bindings) return undefined;
  return { schemaSdl, bindings };
};

const addOptionalRuntimeEnumFields = (
  runtime: GeneratedGraphqlRuntime,
  record: object,
): GeneratedGraphqlRuntime | undefined => {
  const enumFieldsValue = readProperty(record, 'enumFields');
  if (enumFieldsValue === undefined) return runtime;
  const enumFields = parseRuntimeEnumFields(enumFieldsValue);
  return enumFields ? { ...runtime, enumFields } : undefined;
};

const addOptionalRuntimeScalarRefs = (
  runtime: GeneratedGraphqlRuntime,
  record: object,
): GeneratedGraphqlRuntime | undefined => {
  const scalarRefsValue = readProperty(record, 'scalarRefs');
  if (scalarRefsValue === undefined) return runtime;
  const scalarRefs = parseRuntimeScalarRefs(scalarRefsValue);
  return scalarRefs ? { ...runtime, scalarRefs } : undefined;
};

const addOptionalRuntimeScalars = (
  runtime: GeneratedGraphqlRuntime,
  record: object,
): GeneratedGraphqlRuntime | undefined => {
  const scalarsValue = readProperty(record, 'scalars');
  if (scalarsValue === undefined) return runtime;
  const scalars = parseRuntimeScalars(scalarsValue);
  return scalars ? { ...runtime, scalars } : undefined;
};

const addOptionalRuntimeUnions = (
  runtime: GeneratedGraphqlRuntime,
  record: object,
): GeneratedGraphqlRuntime | undefined => {
  const unionsValue = readProperty(record, 'unions');
  if (unionsValue === undefined) return runtime;
  const unions = parseRuntimeUnions(unionsValue);
  return unions ? { ...runtime, unions } : undefined;
};

const parseGeneratedGraphqlRuntime = (value: unknown): GeneratedGraphqlRuntime | undefined => {
  const record = toObject(value);
  if (!record) return undefined;
  const base = parseGeneratedGraphqlRuntimeBase(record);
  if (!base) return undefined;
  const withEnumFields = addOptionalRuntimeEnumFields(base, record);
  if (!withEnumFields) return undefined;
  const withScalarRefs = addOptionalRuntimeScalarRefs(withEnumFields, record);
  if (!withScalarRefs) return undefined;
  const withScalars = addOptionalRuntimeScalars(withScalarRefs, record);
  if (!withScalars) return undefined;
  return addOptionalRuntimeUnions(withScalars, record);
};

const parseVariables = (value: unknown): Readonly<Record<string, unknown>> | null | undefined => {
  if (value === undefined || value === null) return value;
  const record = toObject(value);
  if (!record) return undefined;
  return Object.fromEntries(Object.entries(record));
};

const parseOperationName = (value: unknown): string | null | undefined => {
  if (value === undefined || value === null) return value;
  return typeof value === 'string' ? value : undefined;
};

const isInvalidOptionalValue = (raw: unknown, parsed: unknown): boolean =>
  raw !== undefined && parsed === undefined;

export const parseGraphqlRequestPayload = (value: unknown): GraphqlRequestPayload | undefined => {
  const record = toObject(value);
  if (!record) return undefined;
  const query = readProperty(record, 'query');
  if (typeof query !== 'string') return undefined;
  const variablesRaw = readProperty(record, 'variables');
  const variables = parseVariables(variablesRaw);
  if (isInvalidOptionalValue(variablesRaw, variables)) return undefined;
  const operationNameRaw = readProperty(record, 'operationName');
  const operationName = parseOperationName(operationNameRaw);
  if (isInvalidOptionalValue(operationNameRaw, operationName)) return undefined;
  return {
    query,
    ...(variables !== undefined && { variables }),
    ...(operationName !== undefined && { operationName }),
  };
};

/** @throws {Error} */
export const loadGeneratedGraphqlRuntime = async (
  source: GraphqlRuntimeSource,
): Promise<GeneratedGraphqlRuntime> => {
  const loaded: unknown =
    typeof source === 'function'
      ? await source()
      : typeof source === 'string'
        ? await import(source)
        : source;
  const loadedObject = toObject(loaded);
  const runtime =
    parseGeneratedGraphqlRuntime(loaded) ??
    (loadedObject
      ? parseGeneratedGraphqlRuntime(readProperty(loadedObject, 'graphqlRuntime'))
      : undefined);
  if (!runtime) {
    const sourceLabel = typeof source === 'string' ? `: ${source}` : '';
    throw new Error(
      `GraphQL runtime source must be a manifest or export graphqlRuntime${sourceLabel}`,
    );
  }
  return runtime;
};

/** @throws {Error} */
const findResolverClass = (
  resolvers: readonly GraphqlResolverClass[],
  binding: GeneratedGraphqlBinding,
): GraphqlResolverClass => {
  const resolver = resolvers.find((candidate) => candidate.name === binding.resolver);
  if (!resolver) {
    throw new Error(`GraphQL resolver class not found: ${binding.resolver}`);
  }
  return resolver;
};

/** @throws {Error} */
const callResolverMethod = (
  instance: object,
  methodName: string,
  args: readonly unknown[],
): unknown => {
  const method: unknown = Reflect.get(instance, methodName);
  if (typeof method !== 'function') {
    throw new Error(`GraphQL resolver method not found: ${methodName}`);
  }
  return Reflect.apply(method, instance, [...args]);
};

type ResolveBinding = (
  binding: GeneratedGraphqlBinding,
  parent: unknown,
  args: Readonly<Record<string, unknown>>,
  isRootField: boolean,
) => Promise<unknown>;

/** @throws {Error} */
const createBindingResolver = (options: CreateGraphqlExecutorOptions): ResolveBinding => {
  const resolverCache = new Map<GraphqlResolverClass, object>();

  return async (binding, parent, args, isRootField) => {
    const resolverClass = findResolverClass(options.resolvers, binding);
    const cached = resolverCache.get(resolverClass);
    const instance = cached ?? (await options.resolveResolver(resolverClass));
    if (!cached) resolverCache.set(resolverClass, instance);

    return runWithGraphqlArgs(args, () =>
      callResolverMethod(instance, binding.method, isRootField ? [] : [parent]),
    );
  };
};

// Unknown strings fall through unchanged so GraphQL reports the actual
// unrepresentable value instead of an opaque null/undefined error.
const normalizeEnumScalar = (value: unknown, mapping: Readonly<Record<string, string>>): unknown =>
  typeof value === 'string' ? (mapping[value] ?? value) : value;

const normalizeEnumValue = (value: unknown, mapping: Readonly<Record<string, string>>): unknown =>
  Array.isArray(value)
    ? value.map((element: unknown) => normalizeEnumScalar(element, mapping))
    : normalizeEnumScalar(value, mapping);

type BoundFieldResolver = (
  parent: unknown,
  args: Readonly<Record<string, unknown>>,
) => Promise<unknown>;

const createBoundFieldResolver = (
  binding: GeneratedGraphqlBinding,
  isRootField: boolean,
  resolveBinding: ResolveBinding,
  enumMapping: Readonly<Record<string, string>> | undefined,
): BoundFieldResolver => {
  if (!enumMapping) {
    return (parent, args) => resolveBinding(binding, parent, args, isRootField);
  }
  return async (parent, args) =>
    normalizeEnumValue(await resolveBinding(binding, parent, args, isRootField), enumMapping);
};

const attachTypeBindings = (
  type: GraphQLObjectType,
  bindings: Readonly<Record<string, GeneratedGraphqlBinding>>,
  enumFields: Readonly<Record<string, Readonly<Record<string, string>>>>,
  resolveBinding: ResolveBinding,
): void => {
  const graphqlFields = type.getFields();
  const isRootField = type.name === 'Query' || type.name === 'Mutation';
  for (const [fieldName, binding] of Object.entries(bindings)) {
    const field = graphqlFields[fieldName];
    if (!field) continue;
    field.resolve = createBoundFieldResolver(
      binding,
      isRootField,
      resolveBinding,
      enumFields[fieldName],
    );
  }
};

const attachBindingResolvers = (
  schema: GraphQLSchema,
  runtime: GeneratedGraphqlRuntime,
  resolveBinding: ResolveBinding,
): void => {
  for (const [typeName, fields] of Object.entries(runtime.bindings)) {
    const type = schema.getType(typeName);
    if (!(type instanceof GraphQLObjectType)) continue;
    attachTypeBindings(type, fields, runtime.enumFields?.[typeName] ?? {}, resolveBinding);
  }
};

const resolveEnumFieldValue = (
  parent: unknown,
  fieldName: string,
  mapping: Readonly<Record<string, string>>,
): unknown => {
  const record = toObject(parent);
  if (!record) return undefined;
  return normalizeEnumValue(readProperty(record, fieldName), mapping);
};

const attachEnumFieldResolvers = (
  schema: GraphQLSchema,
  runtime: GeneratedGraphqlRuntime,
): void => {
  for (const [typeName, fields] of Object.entries(runtime.enumFields ?? {})) {
    const type = schema.getType(typeName);
    if (!(type instanceof GraphQLObjectType)) continue;

    const graphqlFields = type.getFields();
    for (const [fieldName, mapping] of Object.entries(fields)) {
      const field = graphqlFields[fieldName];
      if (!field || field.resolve) continue;
      field.resolve = (parent: unknown) => resolveEnumFieldValue(parent, fieldName, mapping);
    }
  }
};

const attachScalarSerializers = (schema: GraphQLSchema, runtime: GeneratedGraphqlRuntime): void => {
  for (const [typeName, scalar] of Object.entries(runtime.scalars ?? {})) {
    const type = schema.getType(typeName);
    if (!(type instanceof GraphQLScalarType)) continue;
    const serialize = scalar.codec.serialize;
    if (typeof serialize !== 'function') continue;
    type.serialize = (value: unknown) => Reflect.apply(serialize, scalar.codec, [value]);
  }
};

const hasAllFields = (value: object, fields: readonly string[]): boolean => {
  const keys = new Set(Object.keys(value));
  return fields.every((field) => keys.has(field));
};

/** @throws {Error} */
const attachUnionResolvers = (schema: GraphQLSchema, runtime: GeneratedGraphqlRuntime): void => {
  for (const [typeName, members] of Object.entries(runtime.unions ?? {})) {
    const type = schema.getType(typeName);
    if (!(type instanceof GraphQLUnionType)) continue;
    type.resolveType = (value) => {
      const record = toObject(value);
      if (!record) {
        throw new Error(`GraphQL union ${typeName} value must be an object`);
      }
      const matches = Object.entries(members).filter(([, fields]) => hasAllFields(record, fields));
      if (matches.length !== 1) {
        throw new Error(
          `GraphQL union ${typeName} could not resolve exactly one member for value fields: ${Object.keys(
            record,
          ).join(', ')}`,
        );
      }
      return matches[0]?.[0];
    };
  }
};

const toValidationGraphqlError = (
  error: GraphQLError,
  original: GraphqlArgsValidationError,
): GraphQLError =>
  new GraphQLError(error.message, {
    nodes: error.nodes ?? null,
    source: error.source ?? null,
    positions: error.positions ?? null,
    path: error.path ?? null,
    originalError: original,
    extensions: { code: 'GRAPHQL_ARGS_VALIDATION_FAILED', issues: original.issues },
  });

const enrichValidationError = (error: GraphQLError): GraphQLError => {
  const original = error.originalError;
  return original instanceof GraphqlArgsValidationError
    ? toValidationGraphqlError(error, original)
    : error;
};

const enrichValidationErrors = (result: ExecutionResult): ExecutionResult => {
  if (!result.errors?.length) return result;
  return { ...result, errors: result.errors.map(enrichValidationError) };
};

// Schema parsing/validation and resolver attachment are static per generated
// runtime, so they run once here instead of on every request.
/** @throws {Error} */
export const createGraphqlExecutor = (options: CreateGraphqlExecutorOptions): GraphqlExecutor => {
  const schema = buildSchema(options.runtime.schemaSdl);
  attachScalarSerializers(schema, options.runtime);
  attachUnionResolvers(schema, options.runtime);
  attachBindingResolvers(schema, options.runtime, createBindingResolver(options));
  attachEnumFieldResolvers(schema, options.runtime);

  const extraRules: readonly ValidationRule[] = options.validationRules ?? [];

  return async (request) => {
    if (extraRules.length > 0) {
      let document: import('graphql').DocumentNode;
      try {
        document = parse(request.query);
      } catch (error) {
        return {
          errors: [error instanceof GraphQLError ? error : new GraphQLError(String(error))],
        };
      }
      const errors = validate(schema, document, [...extraRules]);
      if (errors.length > 0) return { errors };
    }
    return enrichValidationErrors(
      await graphql({
        schema,
        source: request.query,
        variableValues: request.variables ?? undefined,
        operationName: request.operationName ?? undefined,
      }),
    );
  };
};

// Single-shot convenience API: builds the schema on every call. Use
// createGraphqlExecutor() and reuse the executor for repeated execution.
/** @throws {Error} */
export const executeGraphqlRequest = async (
  options: ExecuteGraphqlRequestOptions,
): Promise<ExecutionResult> => createGraphqlExecutor(options)(options.request);
