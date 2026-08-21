import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export type GraphqlCodegenManifestEntry = {
  readonly sdlHash: string;
  readonly schemaPath: string;
  readonly helperPath: string;
};

export type FindGraphqlCodegenManifestEntryResult =
  | { kind: 'found'; readonly entry: GraphqlCodegenManifestEntry }
  | { kind: 'missing' }
  | { kind: 'ambiguous'; readonly entries: readonly GraphqlCodegenManifestEntry[] };

const toHex = (bytes: ArrayBuffer): string =>
  [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

// Shared with stage 0 (`zelt graphql codegen`) so resolverChecks generation
// can look up a helper by the same fingerprint the codegen step recorded.
// Distinct from computeGraphqlPrebuiltHash, which fingerprints path+resolver
// names for prebuilt staleness detection, not schema content.
export const computeSchemaSdlHash = async (schemaSdl: string): Promise<string> => {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(schemaSdl),
  );
  return toHex(digest);
};

const manifestPath = (cwd: string): string => resolve(cwd, '.zelt', 'graphql-codegen.json');

const parseManifestEntry = (value: unknown): GraphqlCodegenManifestEntry | undefined => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const sdlHash: unknown = Reflect.get(value, 'sdlHash');
  const schemaPath: unknown = Reflect.get(value, 'schemaPath');
  const helperPath: unknown = Reflect.get(value, 'helperPath');
  if (
    typeof sdlHash !== 'string' ||
    typeof schemaPath !== 'string' ||
    typeof helperPath !== 'string'
  ) {
    return undefined;
  }
  return { sdlHash, schemaPath, helperPath };
};

export const readGraphqlCodegenManifest = async (
  cwd: string,
): Promise<readonly GraphqlCodegenManifestEntry[]> => {
  const path = manifestPath(cwd);
  if (!existsSync(path)) return [];
  const raw = await readFile(path, 'utf8');
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((entry) => {
    const parsedEntry = parseManifestEntry(entry);
    return parsedEntry ? [parsedEntry] : [];
  });
};

export const upsertGraphqlCodegenManifestEntry = async (
  cwd: string,
  entry: GraphqlCodegenManifestEntry,
): Promise<void> => {
  const existing = await readGraphqlCodegenManifest(cwd);
  const next = [
    ...existing.filter((candidate) => candidate.helperPath !== entry.helperPath),
    entry,
  ].sort((a, b) => a.helperPath.localeCompare(b.helperPath));
  const path = manifestPath(cwd);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
};

export const findGraphqlCodegenManifestEntryBySdlHash = async (
  cwd: string,
  sdlHash: string,
): Promise<FindGraphqlCodegenManifestEntryResult> => {
  const entries = await readGraphqlCodegenManifest(cwd);
  const matches = entries.filter((entry) => entry.sdlHash === sdlHash);
  const [only, ...rest] = matches;
  if (!only) return { kind: 'missing' };
  if (rest.length === 0) return { kind: 'found', entry: only };
  return { kind: 'ambiguous', entries: matches };
};
