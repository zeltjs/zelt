#!/usr/bin/env node
import { parseArgs } from 'node:util';

import { loadZeltConfig } from '@zeltjs/cli';

import {
  findOrphanFiles,
  findStaleFiles,
  planFiles,
  removeFiles,
  writeFiles,
} from './generate.lib';
import type { DrizzleRepositoryOptions, GeneratedFile } from './generation.types';
import { formatErrors, optionsOf, PLUGIN_NAME } from './plugin-options.lib';
import { freshSchemaLoader } from './schema-loader.lib';

const USAGE = 'usage: zelt-drizzle-repository generate --config zelt.config.ts [--check]';

const reportFailure = (message: string): number => {
  process.stderr.write(`${message}\n`);
  return 1;
};

/** @throws {Error} when a generated file cannot be read
 * @throws {unknown} from generate.lib.ts:anonymous_L164
 */
const checkGeneratedFiles = async (
  cwd: string,
  options: DrizzleRepositoryOptions,
  files: readonly GeneratedFile[],
): Promise<number> => {
  const stale = [...(await findStaleFiles(files)), ...(await findOrphanFiles(cwd, options, files))];
  if (stale.length === 0) return 0;
  return reportFailure(
    [
      'drizzle-repository: generated files do not match the schema',
      ...stale.map((path) => `- ${path}`),
    ].join('\n'),
  );
};

/** @throws {Error} when a generated file cannot be written or removed
 * @throws {unknown} from generate.lib.ts:anonymous_L135
 */
const writeGeneratedFiles = async (
  cwd: string,
  options: DrizzleRepositoryOptions,
  files: readonly GeneratedFile[],
): Promise<number> => {
  const orphans = await findOrphanFiles(cwd, options, files);
  await writeFiles(files);
  await removeFiles(orphans);
  return 0;
};

/** @throws {Error} when the zelt config cannot be loaded or a file cannot be read or written
 * @throws {unknown} from generate.lib.ts:anonymous_L135
 * @throws {ZeltConfigLoadError} from config-loader.lib.ts:loadZeltConfig
 */
const runCli = async (): Promise<number> => {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { config: { type: 'string' }, check: { type: 'boolean', default: false } },
  });
  if (positionals[0] !== 'generate') return reportFailure(USAGE);

  const cwd = process.cwd();
  const config = await loadZeltConfig({
    cwd,
    ...(values.config === undefined ? {} : { configFile: values.config }),
  });
  const options = optionsOf(config.plugins?.find((candidate) => candidate.name === PLUGIN_NAME));
  if (options === undefined) {
    return reportFailure(
      `${PLUGIN_NAME}: drizzleRepositoryPlugin() is not in plugins of the zelt config`,
    );
  }

  const files = await planFiles(cwd, options, freshSchemaLoader(cwd));
  if (files.isErr()) return reportFailure(formatErrors(files.error));

  return values.check
    ? checkGeneratedFiles(cwd, options, files.value)
    : writeGeneratedFiles(cwd, options, files.value);
};

process.exitCode = await runCli();
