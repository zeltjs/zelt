import { resolve } from 'node:path';

import { createJiti } from 'jiti';

import { fieldOf } from './row.lib';

// Returns the namespace of each schema file, in the order of the files.
export type SchemaLoader = (files: readonly string[]) => Promise<readonly unknown[]>;

// One evaluation of all files gives a table that one file exports and another imports or re-exports
// as the same object. Each call evaluates the files again, so a long-running process (zelt dev)
// generates from the schema as it is now.
export const freshSchemaLoader =
  (cwd: string): SchemaLoader =>
  async (files) => {
    const jiti = createJiti(resolve(cwd, 'package.json'), { moduleCache: false });
    const entry = files
      .map((file, index) => `export * as m${index} from ${JSON.stringify(file)};`)
      .join('\n');
    const graph: unknown = await jiti.evalModule(entry, {
      filename: resolve(cwd, 'drizzle-repository.schema.ts'),
      async: true,
    });
    return files.map((_, index) => fieldOf(graph, `m${index}`));
  };
