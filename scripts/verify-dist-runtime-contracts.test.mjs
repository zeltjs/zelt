import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import { verifyRuntimeContracts } from './verify-dist-runtime-contracts.mjs';

const temporaryDirectories = [];

const createWorkspace = async ({ exports, files }) => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'zelt-runtime-contracts-'));
  temporaryDirectories.push(rootDir);
  const packageDir = path.join(rootDir, 'packages', 'example');
  await mkdir(path.join(packageDir, 'dist'), { recursive: true });
  await writeFile(
    path.join(packageDir, 'package.json'),
    JSON.stringify({ name: '@example/package', exports }),
  );
  await Promise.all(
    Object.entries(files).map(async ([file, source]) => {
      const output = path.join(packageDir, file);
      await mkdir(path.dirname(output), { recursive: true });
      await writeFile(output, source);
    }),
  );
  return rootDir;
};

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe('verifyRuntimeContracts', () => {
  it('automatically checks ESM and CJS targets of newly added package exports', async () => {
    const rootDir = await createWorkspace({
      exports: {
        '.': { import: './dist/index.js', require: './dist/index.cjs' },
        './new-entry': { import: './dist/new-entry.js', require: './dist/new-entry.cjs' },
      },
      files: {
        'dist/index.js': 'export const value = 1;',
        'dist/index.cjs': 'exports.value = 1;',
        'dist/new-entry.js': 'export const value = 2;',
        'dist/new-entry.cjs': 'exports.value = 2;',
      },
    });

    const result = await verifyRuntimeContracts({ rootDir });

    assert.equal(result.checkedEntrypoints, 4);
    assert.deepEqual(result.missingExportTargets, []);
    assert.deepEqual(result.violations, []);
  });

  it('detects Node builtins in both ESM and CJS portable export targets', async () => {
    const rootDir = await createWorkspace({
      exports: { '.': { import: './dist/index.js', require: './dist/index.cjs' } },
      files: {
        'dist/index.js': "import 'node:fs';",
        'dist/index.cjs': "require('node:fs');",
      },
    });

    const result = await verifyRuntimeContracts({ rootDir });

    assert.deepEqual(
      result.violations.map(({ condition, kind, value }) => ({ condition, kind, value })),
      [
        { condition: 'import', kind: 'node-builtin', value: 'node:fs' },
        { condition: 'require', kind: 'node-builtin', value: 'node:fs' },
      ],
    );
  });
});
