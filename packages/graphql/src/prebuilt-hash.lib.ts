import { getClassMetadata } from '@zeltjs/decorator-metadata';
import type { GraphqlResolverClass } from './graphql-metadata.lib';

const compareText = (left: string, right: string): number =>
  left < right ? -1 : Number(left > right);

const operationKinds = new Set([
  'query',
  'mutation',
  'resolveField',
  'resolveMultiField',
  'relation',
]);

const resolverDeclaration = (resolver: GraphqlResolverClass) => {
  const methods = getClassMetadata(resolver)?.methods ?? [];
  const operations = methods.flatMap((method) => {
    const methodName = method.name;
    if (typeof methodName !== 'string') return [];
    return method.props.flatMap((prop) => {
      const kind: unknown = Reflect.get(prop, 'kind');
      if (typeof kind !== 'string' || !operationKinds.has(kind)) return [];
      const fieldName: unknown = Reflect.get(prop, 'fieldName');
      return [[methodName, kind, typeof fieldName === 'string' ? fieldName : methodName]];
    });
  });
  operations.sort((left, right) => compareText(left[0] ?? '', right[0] ?? ''));
  return { name: resolver.name, operations };
};

const toHex = (bytes: ArrayBuffer): string =>
  [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

// Identity (the prebuilt lookup key) comes from graphql()'s `name`, not this
// hash. This hash only detects staleness: it is embedded in the generated
// entry and recomputed from the live resolvers at startup, so a mismatch
// means the prebuilt module predates the current resolver declarations.
// Erased TypeScript signatures are checked by codegen, not at runtime.
export const computeGraphqlPrebuiltHash = async (
  path: string,
  resolvers: readonly GraphqlResolverClass[],
): Promise<string> => {
  const declarations = resolvers
    .map(resolverDeclaration)
    .sort((a, b) => compareText(a.name, b.name));
  const payload = JSON.stringify([path, declarations]);
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(payload),
  );
  return toHex(digest);
};
