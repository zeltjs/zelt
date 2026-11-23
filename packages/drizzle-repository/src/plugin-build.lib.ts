import type { BuildContext } from '@zeltjs/cli';

import { planFiles, writeFiles } from './generate.lib';
import type { DrizzleRepositoryOptions } from './generation.types';
import { formatErrors } from './plugin-options.lib';
import type { SchemaLoader } from './schema-loader.lib';
import { freshSchemaLoader } from './schema-loader.lib';

// zelt build evaluates the modules it loads for one build in the module graph of the config, so
// schema files loaded one by one share the tables they import from each other.
const loadOneByOne =
  (loadModule: (path: string) => Promise<unknown>): SchemaLoader =>
  async (files) => {
    const namespaces: unknown[] = [];
    for (const file of files) namespaces.push(await loadModule(file));
    return namespaces;
  };

// A failed generation stops the build; generated code that does not match the schema must not ship.
/** @throws {Error} when the schema breaks a generation rule
 * @throws {unknown} from generate.lib.ts:anonymous_L135
 */
export const generateForBuild = async (
  context: BuildContext,
  options: DrizzleRepositoryOptions,
): Promise<void> => {
  // zelt build loads the schema the way it loaded the config; a plain run of the CLI has no such loader.
  const load =
    context.loadModule === undefined
      ? freshSchemaLoader(context.cwd)
      : loadOneByOne(context.loadModule);
  const files = await planFiles(context.cwd, options, load);
  if (files.isErr()) throw new Error(formatErrors(files.error));
  await writeFiles(files.value);
  for (const file of files.value) context.registerGeneratedFile(file.path);
};
