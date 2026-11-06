import { getClassMetadata } from '@zeltjs/decorator-metadata';
import type { GraphqlResolverClass } from './graphql-metadata.lib';

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
    if (typeof method.name !== 'string') return [];
    return method.props.flatMap((prop) => {
      const kind: unknown = Reflect.get(prop, 'kind');
      if (typeof kind !== 'string' || !operationKinds.has(kind)) return [];
      const fieldName: unknown = Reflect.get(prop, 'fieldName');
      return [[method.name, kind, typeof fieldName === 'string' ? fieldName : method.name]];
    });
  });
  operations.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
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
    .sort((a, b) => a.name.localeCompare(b.name));
  const payload = JSON.stringify([path, declarations]);
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(payload),
  );
  return toHex(digest);
};
