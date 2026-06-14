import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type {
  FieldDefinitionNode,
  InputValueDefinitionNode,
  ObjectTypeDefinitionNode,
  TypeNode,
} from 'graphql';
import { Kind, parse } from 'graphql';

const BUILTIN_SCALARS = new Map<string, string>([
  ['ID', 'string'],
  ['String', 'string'],
  ['Int', 'number'],
  ['Float', 'number'],
  ['Boolean', 'boolean'],
]);

export type SchemaFirstCodegenOptions = {
  readonly schema: string;
  readonly out: string;
};

export type SchemaFirstCodegenResult = {
  readonly changed: boolean;
};

type SchemaIndex = {
  readonly objectTypes: Map<string, ObjectTypeDefinitionNode>;
  readonly customScalars: Set<string>;
  readonly unsupportedTypes: Map<string, string>;
};

type TypeRenderOptions = {
  readonly nullable: boolean;
};

const writeIfChanged = async (path: string, content: string): Promise<boolean> => {
  if (existsSync(path)) {
    const existing = await readFile(path, 'utf8');
    if (existing === content) return false;
  }
  await writeFile(path, content, 'utf8');
  return true;
};

const registerSchemaDefinition = (
  index: SchemaIndex,
  definition: ReturnType<typeof parse>['definitions'][number],
): void => {
  if (definition.kind === Kind.OBJECT_TYPE_DEFINITION) {
    index.objectTypes.set(definition.name.value, definition);
    return;
  }
  if (definition.kind === Kind.SCALAR_TYPE_DEFINITION) {
    index.customScalars.add(definition.name.value);
    return;
  }
  if (
    definition.kind === Kind.UNION_TYPE_DEFINITION ||
    definition.kind === Kind.INTERFACE_TYPE_DEFINITION ||
    definition.kind === Kind.ENUM_TYPE_DEFINITION ||
    definition.kind === Kind.INPUT_OBJECT_TYPE_DEFINITION
  ) {
    index.unsupportedTypes.set(definition.name.value, definition.kind);
  }
};

const buildSchemaIndex = (schemaSdl: string): SchemaIndex => {
  const index = {
    objectTypes: new Map<string, ObjectTypeDefinitionNode>(),
    customScalars: new Set<string>(),
    unsupportedTypes: new Map<string, string>(),
  };
  for (const definition of parse(schemaSdl).definitions) {
    registerSchemaDefinition(index, definition);
  }
  return index;
};

/** @throws {Error} */
const renderNamedType = (name: string, index: SchemaIndex): string => {
  const scalar = BUILTIN_SCALARS.get(name);
  if (scalar) return scalar;
  if (index.objectTypes.has(name)) return `Gql.${name}`;
  if (index.customScalars.has(name)) {
    throw new Error(`Schema-first codegen does not support custom scalar "${name}" yet.`);
  }
  if (index.unsupportedTypes.has(name)) {
    throw new Error(`Schema-first codegen does not support GraphQL type "${name}" yet.`);
  }
  throw new Error(`Schema-first codegen does not support GraphQL type "${name}" yet.`);
};

const parenthesizeArrayElement = (type: string): string =>
  type.includes(' | ') ? `(${type})` : type;

/** @throws {Error} */
const renderType = (type: TypeNode, index: SchemaIndex, options: TypeRenderOptions): string => {
  if (type.kind === Kind.NON_NULL_TYPE) {
    return renderType(type.type, index, { nullable: false });
  }

  const nullable = options.nullable;
  const rendered =
    type.kind === Kind.LIST_TYPE
      ? `readonly ${parenthesizeArrayElement(renderType(type.type, index, { nullable: true }))}[]`
      : renderNamedType(type.name.value, index);

  return nullable ? `${rendered} | null` : rendered;
};

/** @throws {Error} */
const renderInputField = (field: InputValueDefinitionNode, index: SchemaIndex): string => {
  const isOptional = field.type.kind !== Kind.NON_NULL_TYPE;
  const optional = isOptional ? '?' : '';
  return `    readonly ${field.name.value}${optional}: ${renderType(field.type, index, {
    nullable: true,
  })};`;
};

/** @throws {Error} */
const renderArgsType = (field: FieldDefinitionNode, index: SchemaIndex): string => {
  const args = field.arguments ?? [];
  if (args.length === 0) return 'Record<string, never>';
  return ['{', ...args.map((arg) => renderInputField(arg, index)), '  }'].join('\n');
};

/** @throws {Error} */
const renderObjectField = (field: FieldDefinitionNode, index: SchemaIndex): string => {
  return `    readonly ${field.name.value}: ${renderType(field.type, index, {
    nullable: true,
  })};`;
};

/** @throws {Error} */
const renderObjectType = (type: ObjectTypeDefinitionNode, index: SchemaIndex): string => {
  const fields = type.fields ?? [];
  return [
    `  export type ${type.name.value} = {`,
    ...fields.map((field) => renderObjectField(field, index)),
    '  };',
  ].join('\n');
};

/** @throws {Error} */
const renderOperationField = (field: FieldDefinitionNode, index: SchemaIndex): string =>
  [
    `    export namespace ${field.name.value} {`,
    `      export type Args = ${renderArgsType(field, index)};`,
    `      export type Result = ${renderType(field.type, index, { nullable: true })};`,
    '      export function args(): Args;',
    '      export function args<Schema extends StandardSchemaV1<unknown, Args>>(',
    '        schema: Schema,',
    '      ): StandardSchemaV1.InferOutput<Schema>;',
    '      export function args(schema?: StandardSchemaV1): Args {',
    '        return schema ? (validateGraphqlArgs(schema) as Args) : readGraphqlArgs<Args>();',
    '      }',
    '    }',
  ].join('\n');

/** @throws {Error} */
const renderOperationNamespace = (
  name: 'Query' | 'Mutation',
  type: ObjectTypeDefinitionNode | undefined,
  index: SchemaIndex,
): string | undefined => {
  if (!type) return undefined;
  return [
    `  export namespace ${name} {`,
    ...(type.fields ?? []).map((field) => renderOperationField(field, index)),
    '  }',
  ].join('\n');
};

/** @throws {Error} */
export const renderSchemaFirstCodegen = (schemaSdl: string): string => {
  const index = buildSchemaIndex(schemaSdl);
  const objectTypes = [...index.objectTypes.values()].filter(
    (type) => type.name.value !== 'Query' && type.name.value !== 'Mutation',
  );
  const query = index.objectTypes.get('Query');
  const mutation = index.objectTypes.get('Mutation');
  const parts = [
    "import type { StandardSchemaV1 } from '@zeltjs/graphql';",
    "import { readGraphqlArgs, validateGraphqlArgs } from '@zeltjs/graphql';",
    '',
    'export namespace Gql {',
    renderOperationNamespace('Query', query, index),
    renderOperationNamespace('Mutation', mutation, index),
    ...objectTypes.map((type) => renderObjectType(type, index)),
    '}',
    '',
  ].flatMap((part) => (part === undefined ? [] : [part]));

  return parts.join('\n');
};

/** @throws {Error} */
export const generateSchemaFirstCodegen = async (
  options: SchemaFirstCodegenOptions,
): Promise<SchemaFirstCodegenResult> => {
  const schemaPath = resolve(options.schema);
  const outPath = resolve(options.out);
  const schemaSdl = await readFile(schemaPath, 'utf8');
  const generated = renderSchemaFirstCodegen(schemaSdl);
  await mkdir(dirname(outPath), { recursive: true });
  return { changed: await writeIfChanged(outPath, generated) };
};
