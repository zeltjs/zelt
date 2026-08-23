import type { GraphqlResolverClass } from './graphql-metadata.lib';

const toHex = (bytes: ArrayBuffer): string =>
  [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

// Identity (the prebuilt lookup key) comes from graphql()'s `name`, not this
// hash. This hash only detects staleness: it is embedded in the generated
// entry and recomputed from the live resolvers at startup, so a mismatch
// means the prebuilt module predates the current resolver set. v1 only
// fingerprints the endpoint path and resolver class names; resolver method
// signatures, argument types, and return types are not detected.
export const computeGraphqlPrebuiltHash = async (
  path: string,
  resolvers: readonly GraphqlResolverClass[],
): Promise<string> => {
  const resolverNames = resolvers.map((resolver) => resolver.name).sort();
  const payload = JSON.stringify([path, resolverNames]);
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(payload),
  );
  return toHex(digest);
};
