import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';

import type { Result } from 'neverthrow';
import { err, ok, ResultAsync } from 'neverthrow';

import type { Domain } from './domain.lib';
import { buildDomains } from './domain.lib';
import { emitModel } from './emit-model.lib';
import { emitRepository } from './emit-repository.lib';
import type { EmitPaths } from './emit-shared.lib';
import { fileBaseName, GENERATED_HEADER } from './emit-shared.lib';
import type {
  DrizzleRepositoryOptions,
  GeneratedFile,
  GenerationError,
  Schema,
} from './generation.types';
import { fieldOf, toRow } from './row.lib';
import type { SchemaLoader } from './schema-loader.lib';
import { readSchema } from './schema-reader.lib';

const MODEL_SUFFIX = '.model.ts';
const REPOSITORY_SUFFIX = '.repository-base.ts';

const withoutExtension = (path: string): string => path.replace(/\.(c|m)?(t|j)sx?$/, '');

const specifier = (fromDirectory: string, to: string): string => {
  const path = withoutExtension(relative(fromDirectory, to)).split('\\').join('/');
  return path.startsWith('.') ? path : `./${path}`;
};

const schemaPaths = (options: DrizzleRepositoryOptions): readonly string[] =>
  typeof options.schema === 'string' ? [options.schema] : options.schema;

type LoadedModule = { readonly file: string; readonly exports: Readonly<Record<string, unknown>> };

type LoadedSchema = {
  readonly exports: Readonly<Record<string, unknown>>;
  // Export name -> absolute path of the schema file that exports it.
  readonly sourceOf: ReadonlyMap<string, string>;
};

const loadModules = async (
  load: SchemaLoader,
  files: readonly string[],
): Promise<readonly LoadedModule[]> => {
  const namespaces = await load(files);
  return files.map((file, index) => ({ file, exports: toRow(namespaces[index]) ?? {} }));
};

const mergeExports = (
  modules: readonly LoadedModule[],
): Result<LoadedSchema, readonly GenerationError[]> => {
  const exports: Record<string, unknown> = {};
  const sourceOf = new Map<string, string>();
  const errors: GenerationError[] = [];
  for (const { file, exports: moduleExports } of modules) {
    for (const [name, value] of Object.entries(moduleExports)) {
      const source = sourceOf.get(name);
      // A file that re-exports another schema file exports the same value, which is not a conflict.
      if (source !== undefined) {
        if (exports[name] !== value) {
          errors.push({ message: `${name}: exported from both ${source} and ${file}` });
        }
        continue;
      }
      exports[name] = value;
      sourceOf.set(name, file);
    }
  }
  return errors.length > 0 ? err(errors) : ok({ exports, sourceOf });
};

const specifiersFrom = (
  directory: string,
  sourceOf: ReadonlyMap<string, string>,
): ReadonlyMap<string, string> =>
  new Map([...sourceOf].map(([name, file]) => [name, specifier(directory, file)]));

const filesOf = (
  cwd: string,
  options: DrizzleRepositoryOptions,
  loaded: LoadedSchema,
  schema: Schema,
  domains: readonly Domain[],
): readonly GeneratedFile[] => {
  const modelDirectory = resolve(cwd, options.out.model);
  const repositoryDirectory = resolve(cwd, options.out.repository);
  const roots = new Map(domains.map((domain) => [domain.root.exportName, domain]));
  const emitPaths: EmitPaths = {
    schemaFromModel: specifiersFrom(modelDirectory, loaded.sourceOf),
    schemaFromRepository: specifiersFrom(repositoryDirectory, loaded.sourceOf),
    modelFromRepository: specifier(repositoryDirectory, modelDirectory),
    databaseFromRepository: specifier(repositoryDirectory, resolve(cwd, options.database.from)),
    databaseName: options.database.name,
  };
  return domains.flatMap((domain): GeneratedFile[] => {
    const base = fileBaseName(domain.root.exportName);
    return [
      {
        path: resolve(modelDirectory, `${base}${MODEL_SUFFIX}`),
        content: emitModel(domain, roots, emitPaths),
      },
      {
        path: resolve(repositoryDirectory, `${base}${REPOSITORY_SUFFIX}`),
        content: emitRepository(domain, schema.drizzleMajor, roots, emitPaths),
      },
    ];
  });
};

export const planFiles = (
  cwd: string,
  options: DrizzleRepositoryOptions,
  load: SchemaLoader,
): ResultAsync<readonly GeneratedFile[], readonly GenerationError[]> =>
  ResultAsync.fromSafePromise(
    loadModules(
      load,
      schemaPaths(options).map((path) => resolve(cwd, path)),
    ),
  )
    .andThen(mergeExports)
    .andThen((loaded) => readSchema(loaded.exports).map((schema) => ({ loaded, schema })))
    .andThen(({ loaded, schema }) =>
      buildDomains(schema).map((domains) => filesOf(cwd, options, loaded, schema, domains)),
    );

/** @throws {Error} when the file cannot be read for another reason than not existing
 * @throws {unknown} from generate.lib.ts:anonymous_L135
 */
const readOrUndefined = (path: string): Promise<string | undefined> =>
  readFile(path, 'utf8').catch((cause: unknown) => {
    if (fieldOf(cause, 'code') === 'ENOENT') return undefined;
    throw cause;
  });

// An unchanged file is not rewritten, so watchers (zelt dev, tsc --watch) do not rebuild for nothing.
/** @throws {Error} when a file cannot be written
 * @throws {unknown} from generate.lib.ts:anonymous_L135
 */
export const writeFiles = async (files: readonly GeneratedFile[]): Promise<void> => {
  for (const file of files) {
    if ((await readOrUndefined(file.path)) === file.content) continue;
    await mkdir(dirname(file.path), { recursive: true });
    await writeFile(file.path, file.content);
  }
};

// Lists generated files whose content on disk differs from what the schema produces now.
/** @throws {Error} when a file cannot be read
 * @throws {unknown} from generate.lib.ts:anonymous_L135
 */
export const findStaleFiles = async (
  files: readonly GeneratedFile[],
): Promise<readonly string[]> => {
  const stale: string[] = [];
  for (const file of files) {
    if ((await readOrUndefined(file.path)) !== file.content) stale.push(file.path);
  }
  return stale;
};

/** @throws {Error} when the directory cannot be read for another reason than not existing
 * @throws {unknown} from generate.lib.ts:anonymous_L164
 */
const listOrEmpty = (directory: string): Promise<readonly string[]> =>
  readdir(directory).catch((cause: unknown) => {
    if (fieldOf(cause, 'code') === 'ENOENT') return [];
    throw cause;
  });

// Lists files this generator wrote earlier for tables that are no longer in the schema.
// The header tells them apart from files the user put in the same folders.
/** @throws {Error} when an output directory cannot be read
 * @throws {unknown} from generate.lib.ts:anonymous_L164
 */
export const findOrphanFiles = async (
  cwd: string,
  options: DrizzleRepositoryOptions,
  files: readonly GeneratedFile[],
): Promise<readonly string[]> => {
  const planned = new Set(files.map((file) => file.path));
  const outputs = [
    { directory: resolve(cwd, options.out.model), suffix: MODEL_SUFFIX },
    { directory: resolve(cwd, options.out.repository), suffix: REPOSITORY_SUFFIX },
  ];
  const orphans: string[] = [];
  for (const { directory, suffix } of outputs) {
    for (const name of await listOrEmpty(directory)) {
      const path = join(directory, name);
      if (!name.endsWith(suffix) || planned.has(path)) continue;
      if ((await readFile(path, 'utf8')).startsWith(GENERATED_HEADER)) orphans.push(path);
    }
  }
  return orphans;
};

/** @throws {Error} when a file cannot be removed */
export const removeFiles = async (paths: readonly string[]): Promise<void> => {
  for (const path of paths) await rm(path);
};
