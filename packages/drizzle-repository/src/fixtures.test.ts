import { resolve } from 'node:path';

import { expect, it } from 'vitest';

import { findStaleFiles, planFiles, writeFiles } from './generate.lib';
import { freshModuleLoader } from './schema-loader.lib';

const fixtures = resolve(import.meta.dirname, 'test/fixtures');

// The repository tests import the generated code, and the type check reads it before any test runs,
// so it is committed. UPDATE_GENERATED=1 rewrites it after the generator or a fixture schema changed.
it.each(['sqlite', 'pg', 'mysql'])(
  'the generated %s fixture matches its schema',
  async (dialect) => {
    const directory = resolve(fixtures, dialect);
    const files = (
      await planFiles(
        directory,
        {
          schema: './schema.ts',
          database: { from: './drizzle.service.ts', name: 'DrizzleService' },
          out: { model: './generated/model', repository: './generated/repository' },
        },
        freshModuleLoader(directory),
      )
    )._unsafeUnwrap();
    if (process.env['UPDATE_GENERATED'] === '1') await writeFiles(files);
    expect(await findStaleFiles(files)).toEqual([]);
  },
);
