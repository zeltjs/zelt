import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

import { getClassSource } from '../packages/decorator-metadata/dist/inspect/index.js';

const runtime = new URL('../packages/decorator-metadata/dist/index.js', import.meta.url).href;

const createPackage = async (t, exports) => {
  const root = await mkdtemp(join(tmpdir(), 'zelt-inspection-entries-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'dist'));
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'inspection-entry-probe', type: 'module', exports }));
  const entry = join(root, 'dist', 'index.mjs');
  await writeFile(join(root, 'dist', 'assets.css'), 'body { color: red; }\n');
  await writeFile(join(root, 'dist', 'index.d.ts'), 'export declare class PublicName {}\n');
  await writeFile(join(root, 'dist', 'index.mjs.map'), '{}\n');
  await writeFile(entry, `import { createClassDecorator } from ${JSON.stringify(runtime)};\nconst decorate = createClassDecorator({type:'probe'});\nexport class PublicName {}\ndecorate(PublicName);\n`);
  const { PublicName } = await import(pathToFileURL(entry).href);
  return { root, entry, PublicName };
};

for (const exports of [
  { './package.json': './package.json', '.': './dist/index.mjs' },
  { '.': './dist/index.mjs', './package.json': './package.json' },
  { './metadata': './package.json', '.': './dist/index.mjs' },
  { './*': './dist/*.mjs' },
  { './*': './dist/*' },
  { './types': './dist/index.d.ts', './map': './dist/index.mjs.map', '.': './dist/index.mjs' },
  { './metadata/*': './*.json', './*': { import: './dist/*.mjs', require: './missing/*.cjs' } },
]) {
  test(`native Node resolves public classes through exports: ${JSON.stringify(exports)}`, async (t) => {
    const { entry, PublicName } = await createPackage(t, exports);
    const result = await getClassSource(PublicName);
    assert.equal(result.isOk(), true, result.isErr() ? result.error.message : '');
    if (result.isOk()) assert.deepEqual(result.value, { filePath: entry, exportName: 'PublicName' });
  });
}

test('native Node preserves a resolved JavaScript import failure', async (t) => {
  const { root, PublicName } = await createPackage(t, {
    './package.json': './package.json', '.': './dist/broken.mjs', './feature': './dist/index.mjs',
  });
  await writeFile(join(root, 'dist', 'broken.mjs'), "import './missing.mjs';\n");
  const result = await getClassSource(PublicName);
  assert.equal(result.isErr(), true);
  if (result.isErr()) {
    assert.equal(result.error.code, 'MODULE_LOAD_FAILED');
    assert.match(result.error.message, /broken.mjs/);
  }
});
