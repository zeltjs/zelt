import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
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

/** @throws {Error} */
export const readGraphqlCodegenManifest = async (
  cwd: string,
): Promise<readonly GraphqlCodegenManifestEntry[]> => {
  const path = manifestPath(cwd);
  if (!existsSync(path)) return [];
  const raw = await readFile(path, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new Error(
      `${path} is corrupt (invalid JSON). Delete it and re-run \`zelt graphql codegen\`.`,
      { cause },
    );
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((entry) => {
    const parsedEntry = parseManifestEntry(entry);
    return parsedEntry ? [parsedEntry] : [];
  });
};

const manifestLockPath = (cwd: string): string => `${manifestPath(cwd)}.lock`;

// mkdir() without `recursive` fails with EEXIST if the target already exists,
// which makes directory creation an atomic test-and-set usable as a mutex
// across processes (e.g. parallel `zelt graphql codegen` runs under turbo).
const LOCK_ACQUIRE_TIMEOUT_MS = 5_000;
const LOCK_RETRY_DELAY_MS = 20;
// A process that crashes while holding the lock leaves the directory behind
// forever; reclaim it after this long instead of deadlocking every future upsert.
const LOCK_STALE_MS = 10_000;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolveTimer) => setTimeout(resolveTimer, ms));

const isEexist = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  const code: unknown = Reflect.get(error, 'code');
  return code === 'EEXIST';
};

/** @throws {Error} */
const acquireManifestLock = async (cwd: string): Promise<void> => {
  const lockPath = manifestLockPath(cwd);
  const startedAt = Date.now();
  for (;;) {
    try {
      await mkdir(lockPath);
      return;
    } catch (error) {
      if (!isEexist(error)) throw error;
      const lockStat = await stat(lockPath).catch(() => undefined);
      if (lockStat && Date.now() - lockStat.mtimeMs > LOCK_STALE_MS) {
        await rm(lockPath, { recursive: true, force: true }).catch(() => undefined);
        continue;
      }
      if (Date.now() - startedAt > LOCK_ACQUIRE_TIMEOUT_MS) {
        throw new Error(
          `Timed out after ${LOCK_ACQUIRE_TIMEOUT_MS}ms waiting for graphql codegen manifest lock at ${lockPath}`,
        );
      }
      await sleep(LOCK_RETRY_DELAY_MS);
    }
  }
};

const releaseManifestLock = async (cwd: string): Promise<void> => {
  await rm(manifestLockPath(cwd), { recursive: true, force: true });
};

/** @throws {Error} */
const withGraphqlCodegenManifestLock = async <T>(cwd: string, fn: () => Promise<T>): Promise<T> => {
  await acquireManifestLock(cwd);
  try {
    return await fn();
  } finally {
    await releaseManifestLock(cwd);
  }
};

// Writing to a temp file in the same directory then renaming makes the
// update atomic from readers' perspective: a crash mid-write can only ever
// leave behind an orphaned temp file, never a truncated/corrupt manifest.
const writeManifestFileAtomic = async (path: string, contents: string): Promise<void> => {
  const tmpPath = `${path}.${globalThis.crypto.randomUUID()}.tmp`;
  await writeFile(tmpPath, contents, 'utf8');
  await rename(tmpPath, path);
};

/** @throws {Error} */
export const upsertGraphqlCodegenManifestEntry = async (
  cwd: string,
  entry: GraphqlCodegenManifestEntry,
): Promise<void> => {
  const path = manifestPath(cwd);
  await mkdir(dirname(path), { recursive: true });
  await withGraphqlCodegenManifestLock(cwd, async () => {
    const existing = await readGraphqlCodegenManifest(cwd);
    const next = [
      ...existing.filter((candidate) => candidate.helperPath !== entry.helperPath),
      entry,
    ].sort((a, b) => a.helperPath.localeCompare(b.helperPath));
    await writeManifestFileAtomic(path, `${JSON.stringify(next, null, 2)}\n`);
  });
};

/** @throws {Error} */
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
