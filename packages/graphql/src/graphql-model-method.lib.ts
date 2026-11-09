import type { ClassMetadata } from '@zeltjs/decorator-metadata/inspect';
import type { ModelTypeReader } from './graphql-model-checker.lib';

type Method = import('typescript').MethodDeclaration;

export type ModelResolverInput = {
  readonly resolver: string;
  readonly metadata: ClassMetadata;
  readonly classNode: import('typescript').ClassDeclaration;
  readonly checker: import('typescript').TypeChecker;
  readonly ts: typeof import('typescript');
};

const OPERATION_KINDS = [
  'query',
  'mutation',
  'resolveField',
  'relation',
  'resolveMultiField',
] as const;
export type OperationKind = (typeof OPERATION_KINDS)[number];

/** A decorated resolver method as it exists at runtime, with the declaration that types it. */
export type ModelMethod = {
  readonly resolver: string;
  readonly name: string;
  readonly kind: OperationKind;
  readonly fieldName: string;
  readonly declaration: Method;
};

const operationKind = (value: unknown): OperationKind | undefined =>
  OPERATION_KINDS.find((kind) => kind === value);

const decoration = (
  props: readonly object[],
): { readonly kind: OperationKind; readonly fieldName: unknown } | undefined => {
  for (const prop of props) {
    const kind = operationKind(Reflect.get(prop, 'kind'));
    if (kind) return { kind, fieldName: Reflect.get(prop, 'fieldName') };
  }
  return undefined;
};

// Runtime methods are looked up by their property key, so computed names and overloads map to
// the one implementation that runs; overload signatures carry no body.
const implementationOf = (
  instance: import('typescript').Type,
  name: string,
  reader: ModelTypeReader,
): Method | undefined => {
  const methods = (reader.checker.getPropertyOfType(instance, name)?.declarations ?? []).filter(
    reader.ts.isMethodDeclaration,
  );
  return methods.find((method) => method.body !== undefined) ?? methods[0];
};

/** The resolver's decorated methods, driven by the runtime metadata rather than the syntax. */
export const readModelMethods = (
  input: ModelResolverInput,
  reader: ModelTypeReader,
): readonly ModelMethod[] => {
  const instance = reader.checker.getTypeAtLocation(input.classNode);
  return input.metadata.methods.flatMap(({ name, props }) => {
    // Symbol-keyed methods have no GraphQL field name to resolve.
    if (typeof name !== 'string') return [];
    const decorated = decoration(props);
    const declaration = decorated && implementationOf(instance, name, reader);
    if (!decorated || !declaration) return [];
    const { kind, fieldName } = decorated;
    const field = typeof fieldName === 'string' ? fieldName : name;
    return [{ resolver: input.resolver, name, kind, fieldName: field, declaration }];
  });
};
