import type { ZeltPlugin } from '@zeltjs/cli';

import type { DrizzleRepositoryOptions } from './generation.types';
import { PLUGIN_NAME } from './plugin-options.lib';

type DrizzleRepositoryPlugin = ZeltPlugin & { readonly options: DrizzleRepositoryOptions };

export const drizzleRepositoryPlugin = (
  options: DrizzleRepositoryOptions,
): DrizzleRepositoryPlugin => ({
  name: PLUGIN_NAME,
  options,
  /** @throws {Error} when the schema breaks a generation rule */
  preBuild: async (context) => {
    // Loaded lazily so that importing the package at runtime does not pull in the generator.
    const { generateForBuild } = await import('./plugin-build.lib');
    await generateForBuild(context, options);
    return undefined;
  },
});
