import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';

import type { ClassMetadata, MethodInfo } from '@zeltjs/decorator-metadata/inspect';
import { getTypeMetadata } from '@zeltjs/decorator-metadata/inspect';
import type { ObjectTypeDefinitionNode } from 'graphql';
import { Kind, parse } from 'graphql';

import type { GraphqlOperationMetadata, GraphqlResolverClass } from './graphql-metadata.lib';

export type GenerateSchemaFirstResolverChecksOptions = {
  readonly schemaSdl: string;
  readonly resolvers: readonly GraphqlResolverClass[];
  readonly tsconfig?: string;
  readonly out: string;
  readonly gqlTypesImport: string;
};

export type GenerateSchemaFirstResolverChecksResult = {
  readonly changed: boolean;
};

type RootOperationKind = 'Query' | 'Mutation';

type SchemaFirstFieldInfo = {
  readonly hasArgs: boolean;
};

type SchemaFirstCheckIndex = {
  readonly queryFields: ReadonlyMap<string, SchemaFirstFieldInfo>;
  readonly mutationFields: ReadonlyMap<string, SchemaFirstFieldInfo>;
};

type ResolverCheck = {
  readonly resolverName: string;
  readonly sourceFile: string;
  readonly methodName: string;
  readonly rootTypeName: RootOperationKind;
  readonly fieldName: string;
  readonly hasArgs: boolean;
};

function toInspectableClass(cls: GraphqlResolverClass): new (...args: unknown[]) => object;
function toInspectableClass(cls: GraphqlResolverClass): unknown {
  return cls;
}

const collectFields = (
  type: ObjectTypeDefinitionNode | undefined,
): ReadonlyMap<string, SchemaFirstFieldInfo> =>
  new Map(
    (type?.fields ?? []).map((field) => [
      field.name.value,
      { hasArgs: (field.arguments ?? []).length > 0 },
    ]),
  );

const buildSchemaIndex = (schemaSdl: string): SchemaFirstCheckIndex => {
  const objectTypes = new Map<string, ObjectTypeDefinitionNode>();
  for (const definition of parse(schemaSdl).definitions) {
    if (definition.kind === Kind.OBJECT_TYPE_DEFINITION) {
      objectTypes.set(definition.name.value, definition);
    }
  }
  return {
    queryFields: collectFields(objectTypes.get('Query')),
    mutationFields: collectFields(objectTypes.get('Mutation')),
  };
};

const getOperationMetadata = (method: MethodInfo): GraphqlOperationMetadata | undefined => {
  for (const prop of method.props) {
    const kind: unknown = Reflect.get(prop, 'kind');
    if (kind === 'query' || kind === 'mutation' || kind === 'resolveField') {
      const fieldName: unknown = Reflect.get(prop, 'fieldName');
      return {
        kind,
        ...(typeof fieldName === 'string' ? { fieldName } : {}),
      };
    }
  }
  return undefined;
};

/** @throws {Error} */
const requireIdentifier = (name: string, usage: string): void => {
  if (/^[$A-Z_a-z][$\w]*$/.test(name)) return;
  throw new Error(`Schema-first resolver checks require ${usage} to be a TypeScript identifier.`);
};

/** @throws {Error} */
const requireRootField = (
  fields: ReadonlyMap<string, SchemaFirstFieldInfo>,
  typeName: RootOperationKind,
  fieldName: string,
): SchemaFirstFieldInfo => {
  const field = fields.get(fieldName);
  if (field) return field;
  throw new Error(`Schema-first resolver checks could not find ${typeName}.${fieldName}.`);
};

const quoteTsString = (value: string): string =>
  `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;

const toAliasPart = (name: string): string => {
  const sanitized = name.replaceAll(/[^0-9A-Z_a-z]+/g, '_');
  return sanitized.replace(/^[0-9]/, '_$&');
};

const toImportSpecifier = (fromFile: string, toFile: string): string => {
  const raw = relative(dirname(resolve(fromFile)), resolve(toFile))
    .replaceAll('\\', '/')
    .replace(/\.[cm]?[tj]sx?$/, '');
  return raw.startsWith('.') ? raw : `./${raw}`;
};

/** @throws {Error} */
const getResolverSourceFile = (metadata: ClassMetadata, resolverName: string): string => {
  const sourceFile = metadata.pos?.sourceFile;
  if (!sourceFile) {
    throw new Error(`Schema-first resolver checks could not locate ${resolverName}.`);
  }
  return sourceFile;
};

/** @throws {Error} */
const addRootCheck = (
  checks: ResolverCheck[],
  index: SchemaFirstCheckIndex,
  resolverName: string,
  sourceFile: string,
  methodName: string,
  operation: GraphqlOperationMetadata,
): void => {
  if (operation.kind === 'resolveField') return;

  const rootTypeName = operation.kind === 'query' ? 'Query' : 'Mutation';
  const fieldName = operation.fieldName ?? methodName;
  requireIdentifier(fieldName, `${rootTypeName}.${fieldName}`);
  const field = requireRootField(
    operation.kind === 'query' ? index.queryFields : index.mutationFields,
    rootTypeName,
    fieldName,
  );
  checks.push({
    resolverName,
    sourceFile,
    methodName,
    rootTypeName,
    fieldName,
    hasArgs: field.hasArgs,
  });
};

/** @throws {Error | UnsupportedTypeScriptVersionError} */
const collectResolverChecks = async (
  options: GenerateSchemaFirstResolverChecksOptions,
): Promise<readonly ResolverCheck[]> => {
  const index = buildSchemaIndex(options.schemaSdl);
  const checks: ResolverCheck[] = [];

  for (const resolver of options.resolvers) {
    const metadataResult = await getTypeMetadata(toInspectableClass(resolver), {
      expandStrategy: 'always',
      ...(options.tsconfig !== undefined && { tsconfig: options.tsconfig }),
    });
    if (metadataResult.isErr()) {
      throw new Error(
        `Failed to inspect GraphQL resolver ${resolver.name}: ${metadataResult.error.message}`,
      );
    }

    const metadata = metadataResult.value;
    const sourceFile = getResolverSourceFile(metadata, resolver.name);
    requireIdentifier(resolver.name, resolver.name);

    for (const method of metadata.methods) {
      if (typeof method.name !== 'string') continue;
      const operation = getOperationMetadata(method);
      if (!operation) continue;
      addRootCheck(checks, index, resolver.name, sourceFile, method.name, operation);
    }
  }

  return checks;
};

const renderImports = (
  checks: readonly ResolverCheck[],
  options: GenerateSchemaFirstResolverChecksOptions,
): readonly string[] => {
  const importsByFile = new Map<string, Set<string>>();
  for (const check of checks) {
    const names = importsByFile.get(check.sourceFile) ?? new Set<string>();
    names.add(check.resolverName);
    importsByFile.set(check.sourceFile, names);
  }

  return [
    `import type { Gql } from ${quoteTsString(options.gqlTypesImport)};`,
    ...[...importsByFile.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([sourceFile, names]) => {
        const importedNames = [...names].sort().join(', ');
        return `import type { ${importedNames} } from ${quoteTsString(
          toImportSpecifier(options.out, sourceFile),
        )};`;
      }),
  ];
};

const renderPreamble = (): readonly string[] => [
  'type AwaitedValue<T> = T extends PromiseLike<infer U> ? AwaitedValue<U> : T;',
  'type Params<Fn> = Fn extends (...args: infer Params) => unknown ? Params : never;',
  'type FirstArg<Fn> = Fn extends (...args: infer Params) => unknown',
  '  ? Params extends readonly []',
  '    ? never',
  '    : Params[0]',
  '  : never;',
  'type AssertTrue<T extends true> = T;',
  'type IsAssignable<Actual, Expected> = [Actual] extends [Expected] ? true : false;',
  'type IsOptionalArg<Arg> = undefined extends Arg ? true : false;',
  'type HasNoParams<Fn> = Params<Fn> extends readonly unknown[]',
  "  ? Params<Fn>['length'] extends 0",
  '    ? true',
  '    : false',
  '  : false;',
  'type HasCompatibleTailParams<Fn> = Params<Fn> extends readonly []',
  '  ? true',
  '  : Fn extends (arg: FirstArg<Fn>) => unknown',
  '    ? true',
  '    : false;',
  'type AllowsNoArgsField<Fn, Args> = HasNoParams<Fn> extends true',
  '  ? HasCompatibleTailParams<Fn>',
  '  : IsAssignable<Exclude<FirstArg<Fn>, undefined>, Args> extends true',
  '    ? IsOptionalArg<FirstArg<Fn>> extends true',
  '      ? HasCompatibleTailParams<Fn>',
  '      : false',
  '    : false;',
];

const renderCheck = (check: ResolverCheck): readonly string[] => {
  const aliasBase = `_Check_${toAliasPart(check.resolverName)}_${toAliasPart(check.methodName)}`;
  const methodType = `${check.resolverName}[${quoteTsString(check.methodName)}]`;
  const fieldTypes = `Gql.${check.rootTypeName}.${check.fieldName}`;
  if (!check.hasArgs) {
    return [
      `type ${aliasBase}_args = AssertTrue<AllowsNoArgsField<${methodType}, ${fieldTypes}.Args>>;`,
      `type ${aliasBase}_return = AssertTrue<IsAssignable<AwaitedValue<ReturnType<${methodType}>>, ${fieldTypes}.Result>>;`,
    ];
  }
  return [
    `type ${aliasBase}_args = AssertTrue<IsAssignable<Exclude<FirstArg<${methodType}>, undefined>, ${fieldTypes}.Args>>;`,
    `type ${aliasBase}_args_optional = AssertTrue<IsOptionalArg<FirstArg<${methodType}>>>;`,
    `type ${aliasBase}_args_tail = AssertTrue<HasCompatibleTailParams<${methodType}>>;`,
    `type ${aliasBase}_return = AssertTrue<IsAssignable<AwaitedValue<ReturnType<${methodType}>>, ${fieldTypes}.Result>>;`,
  ];
};

/** @throws {Error | UnsupportedTypeScriptVersionError} */
export const renderSchemaFirstResolverChecks = async (
  options: GenerateSchemaFirstResolverChecksOptions,
): Promise<string> => {
  const checks = await collectResolverChecks(options);
  const parts = [
    ...renderImports(checks, options),
    '',
    ...renderPreamble(),
    '',
    ...checks.flatMap((check) => [...renderCheck(check), '']),
  ];
  return parts.join('\n');
};

const writeIfChanged = async (path: string, content: string): Promise<boolean> => {
  if (existsSync(path)) {
    const existing = await readFile(path, 'utf8');
    if (existing === content) return false;
  }
  await writeFile(path, content, 'utf8');
  return true;
};

/** @throws {Error | UnsupportedTypeScriptVersionError} */
export const generateSchemaFirstResolverChecks = async (
  options: GenerateSchemaFirstResolverChecksOptions,
): Promise<GenerateSchemaFirstResolverChecksResult> => {
  const outPath = resolve(options.out);
  const generated = await renderSchemaFirstResolverChecks({ ...options, out: outPath });
  await mkdir(dirname(outPath), { recursive: true });
  return { changed: await writeIfChanged(outPath, generated) };
};
