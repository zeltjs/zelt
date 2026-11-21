import type { BuildContext } from '@zeltjs/cli';

import { planFiles, writeFiles } from './generate.lib';
import type { DrizzleRepositoryOptions } from './generation.types';
import { formatErrors } from './plugin-options.lib';
import { freshModuleLoader } from './schema-loader.lib';

// A failed generation stops the build; generated code that does not match the schema must not ship.
/** @throws {Error} when the schema breaks a generation rule
 * @throws {unknown} from generate.lib.ts:anonymous_L135
 */
export const generateForBuild = async (
  context: BuildContext,
  options: DrizzleRepositoryOptions,
): Promise<void> => {
  // zelt build loads the schema the way it loaded the config; a plain run of the CLI has no such loader.
  const load = context.loadModule ?? freshModuleLoader(context.cwd);
  const files = await planFiles(context.cwd, options, load);
  if (files.isErr()) throw new Error(formatErrors(files.error));
  await writeFiles(files.value);
  for (const file of files.value) context.registerGeneratedFile(file.path);
};
