import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { afterAll, expect, it } from 'vitest';

// Tests run from the workspace root too, so paths are taken from this package.
const packageRoot = resolve(import.meta.dirname, '..');

const run = promisify(execFile);
const zelt = resolve(packageRoot, 'node_modules/@zeltjs/cli/bin/zelt.mjs');
let directory: string;

afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});

// An application builds with zelt build: preBuild writes the repositories, and the bundle runs.
it('zelt build generates the repositories, and removes them when their table leaves the schema', async () => {
  await mkdir(resolve(packageRoot, '.tmp'), { recursive: true });
  directory = await mkdtemp(join(resolve(packageRoot, '.tmp'), 'zelt-app-'));
  await cp(resolve(packageRoot, 'src/test/fixtures/zelt-app'), directory, { recursive: true });

  await run('node', [zelt, 'build'], { cwd: directory });
  const { stdout } = await run('node', ['out/main.mjs'], { cwd: directory });
  expect(JSON.parse(stdout)).toEqual({ id: 't1', name: 'acme' });
  expect((await readdir(join(directory, 'repository'))).sort()).toEqual([
    'note.repository-base.ts',
    'tenant.repository-base.ts',
  ]);

  const schema = join(directory, 'schema.ts');
  await writeFile(schema, (await readFile(schema, 'utf8')).replace(/^export const note.*$/m, ''));
  await run('node', [zelt, 'build'], { cwd: directory });
  expect(await readdir(join(directory, 'repository'))).toEqual(['tenant.repository-base.ts']);
  expect(await readdir(join(directory, 'model'))).toEqual(['tenant.model.ts']);
}, 120_000);
