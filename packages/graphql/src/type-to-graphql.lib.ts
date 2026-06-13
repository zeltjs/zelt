import type { TypeInfo } from '@zeltjs/decorator-metadata/inspect';
import { match } from 'ts-pattern';

type GraphqlTypeRef = {
  readonly type: string;
  readonly nullable: boolean;
};

type GraphqlObjectDefinition = {
  readonly name: string;
  readonly fields: Map<string, string>;
};

type GraphqlEnumDefinition = {
  readonly name: string;
  readonly values: readonly string[];
};

export type GraphqlTypeContext = {
  readonly objects: Map<string, GraphqlObjectDefinition>;
  readonly enums: Map<string, GraphqlEnumDefinition>;
  readonly enumFields: Map<string, Map<string, Readonly<Record<string, string>>>>;
  readonly referencedTypes: Set<string>;
};

export type GraphqlTypeResult = {
  readonly type: string;
  readonly nullable: boolean;
  readonly definitions: readonly string[];
};

export const createGraphqlTypeContext = (): GraphqlTypeContext => ({
  objects: new Map(),
  enums: new Map(),
  enumFields: new Map(),
  referencedTypes: new Set(),
});

const primitiveMap: Record<string, string | undefined> = {
  string: 'String',
  number: 'Float',
  boolean: 'Boolean',
};

const isInternalBrandProperty = (name: string): boolean => name.startsWith('__@');

const toPascalCase = (value: string): string => {
  const parts = value.match(/[A-Za-z0-9]+/g) ?? [];
  const joined = parts.map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join('');
  return joined.length > 0 ? joined : 'Value';
};

const toGraphqlTypeName = (value: string): string => {
  const name = toPascalCase(value);
  return /^[A-Za-z_]/.test(name) ? name : `_${name}`;
};

const toEnumValue = (value: string): string => {
  const normalized = value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
  const name = normalized.length > 0 ? normalized : 'VALUE';
  return /^[A-Z_]/.test(name) ? name : `_${name}`;
};

const renderType = (ref: GraphqlTypeRef): string => (ref.nullable ? ref.type : `${ref.type}!`);

const isNullishType = (type: TypeInfo): boolean =>
  type.kind === 'primitive' && (type.type === 'null' || type.type === 'undefined');

const getStringLiteralValues = (types: readonly TypeInfo[]): readonly string[] | undefined => {
  const values: string[] = [];
  for (const type of types) {
    if (type.kind !== 'literal' || typeof type.value !== 'string') return undefined;
    values.push(type.value);
  }
  return values;
};

const getStringLiteralUnionValues = (type: TypeInfo): readonly string[] | undefined => {
  if (type.kind !== 'union') return undefined;
  return getStringLiteralValues(type.types.filter((t) => !isNullishType(t)));
};

/** @throws {Error} */
const ensureEnum = (
  ctx: GraphqlTypeContext,
  nameHint: string | undefined,
  values: readonly string[],
): GraphqlTypeRef => {
  const enumName = toGraphqlTypeName(nameHint ?? 'GraphqlEnum');
  const enumValues = values.map(toEnumValue);
  const existing = ctx.enums.get(enumName);
  if (existing && existing.values.join('\0') !== enumValues.join('\0')) {
    throw new Error(`Duplicate GraphQL enum with incompatible values: ${enumName}`);
  }
  ctx.enums.set(enumName, { name: enumName, values: enumValues });
  return { type: enumName, nullable: false };
};

const ensureObject = (ctx: GraphqlTypeContext, name: string): GraphqlObjectDefinition => {
  const objectName = toGraphqlTypeName(name);
  const existing = ctx.objects.get(objectName);
  if (existing) return existing;
  const created = { name: objectName, fields: new Map<string, string>() };
  ctx.objects.set(objectName, created);
  return created;
};

/** @throws {Error} */
const addFieldDefinition = (
  object: GraphqlObjectDefinition,
  fieldName: string,
  renderedType: string,
): void => {
  const existing = object.fields.get(fieldName);
  if (existing && existing !== renderedType) {
    throw new Error(`Duplicate GraphQL field with incompatible type: ${object.name}.${fieldName}`);
  }
  object.fields.set(fieldName, renderedType);
};

// Records the TS literal -> GraphQL enum value mapping so the generated
// runtime can convert resolver return values (e.g. 'low_stock' -> LOW_STOCK).
// Used for both object fields and Query/Mutation root fields.
export const addEnumFieldMappingForType = (
  ctx: GraphqlTypeContext,
  objectName: string,
  fieldName: string,
  type: TypeInfo,
): void => {
  const awaited = type.kind === 'promise' ? type.inner : type;
  const unwrapped = awaited.kind === 'array' ? awaited.items : awaited;
  const values = getStringLiteralUnionValues(unwrapped);
  if (values) {
    addEnumFieldMapping(ctx, objectName, fieldName, values);
  }
};

const addEnumFieldMapping = (
  ctx: GraphqlTypeContext,
  objectName: string,
  fieldName: string,
  values: readonly string[],
): void => {
  const objectFields =
    ctx.enumFields.get(objectName) ?? new Map<string, Readonly<Record<string, string>>>();
  objectFields.set(
    fieldName,
    Object.fromEntries(values.map((value) => [value, toEnumValue(value)])),
  );
  ctx.enumFields.set(objectName, objectFields);
};

/** @throws {Error} */
const convertObject = (
  type: TypeInfo & { kind: 'object' },
  ctx: GraphqlTypeContext,
  nameHint: string | undefined,
): GraphqlTypeRef => {
  if (!nameHint) {
    throw new Error('Anonymous object GraphQL output requires a name hint');
  }

  const object = ensureObject(ctx, nameHint);
  for (const prop of type.properties) {
    addGraphqlField(
      ctx,
      object.name,
      prop.name,
      prop.type,
      `${object.name}${toPascalCase(prop.name)}`,
      {
        nullable: prop.optional,
      },
    );
  }

  return { type: object.name, nullable: false };
};

/** @throws {Error} */
const convertUnion = (
  type: TypeInfo & { kind: 'union' },
  ctx: GraphqlTypeContext,
  nameHint: string | undefined,
): GraphqlTypeRef => {
  const nonNullishTypes = type.types.filter((t) => !isNullishType(t));
  const nullable = nonNullishTypes.length !== type.types.length;
  const stringLiteralValues = getStringLiteralValues(nonNullishTypes);
  if (stringLiteralValues) {
    const enumRef = ensureEnum(ctx, nameHint, stringLiteralValues);
    return { ...enumRef, nullable };
  }

  if (nonNullishTypes.length === 1) {
    const inner = convertTypeInfoToGraphqlRef(
      nonNullishTypes[0] ?? { kind: 'unknown' },
      ctx,
      nameHint,
    );
    return { ...inner, nullable: inner.nullable || nullable };
  }

  throw new Error('GraphQL output union support is limited to nullable values and string enums');
};

/** @throws {Error} */
const convertPrimitive = (type: TypeInfo & { kind: 'primitive' }): GraphqlTypeRef => {
  if (type.type === 'null' || type.type === 'undefined') {
    throw new Error(`Bare ${type.type} GraphQL output type is not supported`);
  }
  const mapped = primitiveMap[type.type];
  if (!mapped) throw new Error(`Unsupported GraphQL primitive output type: ${type.type}`);
  return { type: mapped, nullable: false };
};

const convertLiteral = (type: TypeInfo & { kind: 'literal' }): GraphqlTypeRef => {
  if (typeof type.value === 'string') return { type: 'String', nullable: false };
  if (typeof type.value === 'number') return { type: 'Float', nullable: false };
  return { type: 'Boolean', nullable: false };
};

/** @throws {Error} */
export const convertTypeInfoToGraphqlRef = (
  type: TypeInfo,
  ctx: GraphqlTypeContext,
  nameHint?: string,
): GraphqlTypeRef =>
  match(type)
    .with({ kind: 'primitive' }, convertPrimitive)
    .with({ kind: 'literal' }, convertLiteral)
    .with({ kind: 'array' }, (t) => {
      const inner = convertTypeInfoToGraphqlRef(t.items, ctx, nameHint);
      return { type: `[${renderType(inner)}]`, nullable: false };
    })
    .with({ kind: 'object' }, (t) => convertObject(t, ctx, nameHint))
    .with({ kind: 'union' }, (t) => convertUnion(t, ctx, nameHint))
    .with({ kind: 'promise' }, (t) => convertTypeInfoToGraphqlRef(t.inner, ctx, nameHint))
    .with({ kind: 'named' }, (t) => {
      const name = toGraphqlTypeName(t.name);
      ctx.referencedTypes.add(name);
      return { type: name, nullable: false };
    })
    .with({ kind: 'ref' }, (t) => {
      const name = toGraphqlTypeName(t.name);
      ctx.referencedTypes.add(name);
      return { type: name, nullable: false };
    })
    .with({ kind: 'unknown' }, () => {
      throw new Error('Unsupported GraphQL unknown output type');
    })
    .exhaustive();

const GRAPHQL_NAME_PATTERN = /^[_A-Za-z][_0-9A-Za-z]*$/;

/** @throws {Error} */
export const addGraphqlField = (
  ctx: GraphqlTypeContext,
  objectName: string,
  fieldName: string,
  type: TypeInfo,
  typeNameHint?: string,
  options: { readonly nullable?: boolean } = {},
): void => {
  if (isInternalBrandProperty(fieldName)) return;
  if (!GRAPHQL_NAME_PATTERN.test(fieldName)) {
    throw new Error(`Invalid GraphQL field name: ${objectName}.${fieldName}`);
  }
  const object = ensureObject(ctx, objectName);
  const ref = convertTypeInfoToGraphqlRef(type, ctx, typeNameHint);
  const fieldRef = { ...ref, nullable: ref.nullable || options.nullable === true };
  addFieldDefinition(object, fieldName, renderType(fieldRef));

  const enumValues = getStringLiteralUnionValues(type);
  if (enumValues) {
    addEnumFieldMapping(ctx, object.name, fieldName, enumValues);
  }
};

const printObject = (object: GraphqlObjectDefinition): string => {
  const fields = [...object.fields.entries()].map(([name, type]) => `  ${name}: ${type}`);
  return `type ${object.name} {\n${fields.join('\n')}\n}`;
};

const printEnum = (definition: GraphqlEnumDefinition): string => {
  const values = definition.values.map((value) => `  ${value}`);
  return `enum ${definition.name} {\n${values.join('\n')}\n}`;
};

/** @throws {Error} */
export const renderGraphqlDefinitions = (ctx: GraphqlTypeContext): readonly string[] => {
  for (const name of ctx.referencedTypes) {
    if (!ctx.objects.has(name) && !ctx.enums.has(name)) {
      throw new Error(`Unregistered GraphQL type referenced: ${name}`);
    }
  }
  return [...[...ctx.objects.values()].map(printObject), ...[...ctx.enums.values()].map(printEnum)];
};

/** @throws {Error} */
export const typeInfoToGraphqlType = (type: TypeInfo, nameHint?: string): GraphqlTypeResult => {
  const ctx = createGraphqlTypeContext();
  const ref = convertTypeInfoToGraphqlRef(type, ctx, nameHint);
  return {
    type: renderType(ref),
    nullable: ref.nullable,
    definitions: renderGraphqlDefinitions(ctx),
  };
};
