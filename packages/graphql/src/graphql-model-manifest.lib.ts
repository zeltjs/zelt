import type {
  GraphqlModelBinding,
  GraphqlModelDefinition,
  GraphqlModelField,
  GraphqlModelFields,
  GraphqlModelProperty,
  GraphqlModelResultShape,
  GraphqlModels,
  GraphqlModelValue,
} from './graphql-model.types';

const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : undefined;

const parseBinding = (value: unknown): GraphqlModelBinding | undefined => {
  const entry = record(value);
  if (!entry || typeof entry['resolver'] !== 'string' || typeof entry['method'] !== 'string') {
    return undefined;
  }
  return { resolver: entry['resolver'], method: entry['method'] };
};

const parseValue = (value: unknown, depth = 0): GraphqlModelValue | undefined => {
  const entry = record(value);
  if (!entry || depth > 64) return undefined;
  return match(entry)
    .returnType<GraphqlModelValue | undefined>()
    .with({ kind: 'opaque' }, () => ({ kind: 'opaque' }))
    .with({ kind: 'scalar', name: P.union('ID', 'string', 'number', 'boolean') }, ({ name }) => ({
      kind: 'scalar',
      name,
    }))
    .with({ kind: 'array' }, (array) => {
      const item = parseValue(array['item'], depth + 1);
      return item ? { kind: 'array', item } : undefined;
    })
    .with({ kind: 'nullable' }, (nullable) => {
      const inner = parseValue(nullable['inner'], depth + 1);
      return inner ? { kind: 'nullable', inner } : undefined;
    })
    .with({ kind: 'optional' }, (optional) => {
      const inner = parseValue(optional['inner'], depth + 1);
      return inner ? { kind: 'optional', inner } : undefined;
    })
    .otherwise(() => undefined);
};

const parseProperty = (value: unknown): GraphqlModelProperty | undefined => {
  const entry = record(value);
  if (!entry || typeof entry['name'] !== 'string' || typeof entry['optional'] !== 'boolean') {
    return undefined;
  }
  const propertyValue = parseValue(entry['value']);
  return propertyValue
    ? { name: entry['name'], optional: entry['optional'], value: propertyValue }
    : undefined;
};

const parseProperties = (value: unknown): readonly GraphqlModelProperty[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const properties: GraphqlModelProperty[] = [];
  const names = new Set<string>();
  for (const raw of value) {
    const property = parseProperty(raw);
    if (!property || names.has(property.name)) return undefined;
    names.add(property.name);
    properties.push(property);
  }
  return properties;
};

const hasScalarId = (properties: readonly GraphqlModelProperty[]): boolean =>
  match(properties.find((property) => property.name === 'id'))
    .with({ optional: false, value: { kind: 'scalar', name: P.union('ID', 'string') } }, () => true)
    .otherwise(() => false);

const parseProvided = (
  entry: Record<string, unknown>,
  properties: readonly GraphqlModelProperty[],
): GraphqlModelDefinition | undefined => {
  const mode = entry['mode'];
  const provider = parseBinding(entry['provider']);
  if ((mode !== 'single' && mode !== 'batch') || !provider) return undefined;
  return { kind: 'provided', provider, properties, mode };
};

const parseModel = (value: unknown): GraphqlModelDefinition | undefined => {
  const entry = record(value);
  const properties = entry && parseProperties(entry['properties']);
  if (!entry || !properties || !hasScalarId(properties)) return undefined;
  return match(entry['kind'])
    .returnType<GraphqlModelDefinition | undefined>()
    .with('identity', () =>
      properties.length === 1 ? { kind: 'identity', properties } : undefined,
    )
    .with('provided', () => parseProvided(entry, properties))
    .otherwise(() => undefined);
};

const parseShape = (value: unknown): GraphqlModelResultShape | undefined => {
  const entry = record(value);
  if (!entry || typeof entry['nullable'] !== 'boolean') return undefined;
  if (entry['kind'] === 'one') return { kind: 'one', nullable: entry['nullable'] };
  if (entry['kind'] === 'many' && typeof entry['itemNullable'] === 'boolean') {
    return { kind: 'many', nullable: entry['nullable'], itemNullable: entry['itemNullable'] };
  }
  return undefined;
};

const parseDependencies = (value: unknown): readonly string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const dependencies: string[] = [];
  for (const key of value) {
    if (typeof key !== 'string' || dependencies.includes(key)) return undefined;
    dependencies.push(key);
  }
  return dependencies;
};

const parseField = (value: unknown): GraphqlModelField | undefined => {
  const entry = record(value);
  if (!entry) return undefined;
  return match(entry)
    .returnType<GraphqlModelField | undefined>()
    .with({ kind: 'computed', mode: P.union('single', 'batch') }, ({ mode }) =>
      parseComputed(entry, mode),
    )
    .with({ kind: 'query', target: P.string }, ({ target }) => {
      const shape = parseShape(entry['shape']);
      return shape ? { kind: 'query', target, shape } : undefined;
    })
    .with(
      { kind: 'relation', target: P.string, mode: P.union('single', 'batch') },
      ({ target, mode }) => parseRelation(entry, target, mode),
    )
    .otherwise(() => undefined);
};

const isPublicValue = (value: GraphqlModelValue): boolean =>
  match(value)
    .with({ kind: 'opaque' }, () => false)
    .with({ kind: 'scalar' }, () => true)
    .with({ kind: 'array' }, ({ item }) => isPublicValue(item))
    .with({ kind: P.union('nullable', 'optional') }, ({ inner }) => isPublicValue(inner))
    .exhaustive();

const parseComputed = (
  entry: Record<string, unknown>,
  mode: 'single' | 'batch',
): GraphqlModelField | undefined => {
  const dependencies = parseDependencies(entry['dependencies']);
  const value = parseValue(entry['value']);
  if (!dependencies || !value || !isPublicValue(value)) return undefined;
  return { kind: 'computed', dependencies, mode, value };
};

const parseRelation = (
  entry: Record<string, unknown>,
  target: string,
  mode: 'single' | 'batch',
): GraphqlModelField | undefined => {
  const shape = parseShape(entry['shape']);
  if (!shape) return undefined;
  const dependencies = parseDependencies(entry['dependencies']);
  return dependencies ? { kind: 'relation', target, shape, dependencies, mode } : undefined;
};

const parseRecord = <T>(
  value: unknown,
  parse: (entry: unknown) => T | undefined,
): Record<string, T> | undefined => {
  const entries = record(value);
  if (!entries) return undefined;
  const output: [string, T][] = [];
  for (const [key, raw] of Object.entries(entries)) {
    const parsed = parse(raw);
    if (parsed === undefined) return undefined;
    output.push([key, parsed]);
  }
  return Object.fromEntries(output);
};

const hasValidFieldReferences = (
  models: GraphqlModels,
  names: ReadonlySet<string>,
  owner: string,
  field: GraphqlModelField,
): boolean => {
  if (field.kind !== 'computed' && !names.has(field.target)) return false;
  if (field.kind === 'query') return owner === 'Query';
  const parent = models[owner];
  if (!parent || !names.has(owner)) return false;
  return hasValidDependencies(parent, field);
};

const hasValidDependencies = (
  parent: GraphqlModelDefinition,
  field: Exclude<GraphqlModelField, { kind: 'query' }>,
): boolean => {
  if (field.mode === 'batch' && !field.dependencies.includes('id')) return false;
  const keys = new Set(parent.properties.map((property) => property.name));
  return field.dependencies.every((key) => keys.has(key));
};

const hasValidReferences = (models: GraphqlModels, fields: GraphqlModelFields): boolean => {
  const names = new Set(Object.keys(models));
  return Object.entries(fields).every(([owner, definitions]) =>
    Object.values(definitions).every((field) =>
      hasValidFieldReferences(models, names, owner, field),
    ),
  );
};

export const parseGraphqlModelManifest = (
  modelsValue: unknown,
  fieldsValue: unknown,
): { readonly models: GraphqlModels; readonly modelFields: GraphqlModelFields } | undefined => {
  const models = parseRecord(modelsValue, parseModel);
  const modelFields = parseRecord(fieldsValue, (value) => parseRecord(value, parseField));
  if (!models || !modelFields || !hasValidReferences(models, modelFields)) return undefined;
  return { models, modelFields };
};

import { match, P } from 'ts-pattern';
