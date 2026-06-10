import type { TypeInfo } from '@zeltjs/decorator-metadata/inspect';

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

const addEnumFieldMapping = (
  ctx: GraphqlTypeContext,
  objectName: string,
  fieldName: string,
  values: readonly string[],
): void => {
  const objectFields = ctx.enumFields.get(objectName) ?? new Map();
  objectFields.set(
    fieldName,
    Object.fromEntries(values.map((value) => [value, toEnumValue(value)])),
  );
  ctx.enumFields.set(objectName, objectFields);
};

const convertObject = (
  type: TypeInfo & { readonly kind: 'object' },
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

const convertUnion = (
  type: TypeInfo & { readonly kind: 'union' },
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

export const convertTypeInfoToGraphqlRef = (
  type: TypeInfo,
  ctx: GraphqlTypeContext,
  nameHint?: string,
): GraphqlTypeRef => {
  switch (type.kind) {
    case 'primitive': {
      if (type.type === 'null' || type.type === 'undefined') {
        return { type: 'String', nullable: true };
      }
      const mapped = primitiveMap[type.type];
      if (!mapped) throw new Error(`Unsupported GraphQL primitive output type: ${type.type}`);
      return { type: mapped, nullable: false };
    }
    case 'literal': {
      if (typeof type.value === 'string') return { type: 'String', nullable: false };
      if (typeof type.value === 'number') return { type: 'Float', nullable: false };
      return { type: 'Boolean', nullable: false };
    }
    case 'array': {
      const inner = convertTypeInfoToGraphqlRef(type.items, ctx, nameHint);
      return { type: `[${renderType(inner)}]`, nullable: false };
    }
    case 'object':
      return convertObject(type, ctx, nameHint);
    case 'union':
      return convertUnion(type, ctx, nameHint);
    case 'promise':
      return convertTypeInfoToGraphqlRef(type.inner, ctx, nameHint);
    case 'named':
    case 'ref':
      return { type: toGraphqlTypeName(type.name), nullable: false };
    case 'unknown':
      throw new Error('Unsupported GraphQL unknown output type');
  }
};

export const addGraphqlField = (
  ctx: GraphqlTypeContext,
  objectName: string,
  fieldName: string,
  type: TypeInfo,
  typeNameHint?: string,
  options: { readonly nullable?: boolean } = {},
): void => {
  if (isInternalBrandProperty(fieldName)) return;
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

export const renderGraphqlDefinitions = (ctx: GraphqlTypeContext): readonly string[] => [
  ...[...ctx.objects.values()].map(printObject),
  ...[...ctx.enums.values()].map(printEnum),
];

export const typeInfoToGraphqlType = (type: TypeInfo, nameHint?: string): GraphqlTypeResult => {
  const ctx = createGraphqlTypeContext();
  const ref = convertTypeInfoToGraphqlRef(type, ctx, nameHint);
  return {
    type: renderType(ref),
    nullable: ref.nullable,
    definitions: renderGraphqlDefinitions(ctx),
  };
};
