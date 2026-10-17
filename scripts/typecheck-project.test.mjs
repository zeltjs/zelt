import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const checker = fileURLToPath(new URL('./typecheck-project.mjs', import.meta.url));
const json = (file, value) => writeFileSync(file, JSON.stringify(value, null, 2));

test('project checking invalidates warm results when imported distribution types change', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'zelt-typecheck-contract-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const name of ['producer', 'consumer']) {
    const directory = join(root, name);
    mkdirSync(join(directory, 'src'), { recursive: true });
    mkdirSync(join(directory, 'dist'));
    json(join(directory, 'package.json'), {
      name, version: '1.0.0', type: 'module',
      exports: { '.': { types: './dist/index.d.ts' } },
    });
    json(join(directory, 'tsconfig.json'), {
      compilerOptions: {
        composite: true, strict: true, target: 'ES2022', module: 'ESNext',
        moduleResolution: 'Bundler', declaration: true, emitDeclarationOnly: true,
        rootDir: 'src', outDir: '.typebuild', tsBuildInfoFile: '.typebuild/.tsbuildinfo',
      },
      include: ['src'],
      ...(name === 'consumer' ? { references: [{ path: '../producer' }] } : {}),
    });
  }
  const published = join(root, 'producer', 'dist', 'index.d.ts');
  const source = join(root, 'consumer', 'src', 'index.ts');
  writeFileSync(join(root, 'producer', 'src', 'index.ts'), "export const value: string = 'valid';\n");
  writeFileSync(published, 'export declare const value: string;\n');
  writeFileSync(source, "import { value } from 'producer'; export const checked: string = value;\n");
  mkdirSync(join(root, 'node_modules'));
  symlinkSync(join(root, 'producer'), join(root, 'node_modules', 'producer'), process.platform === 'win32' ? 'junction' : 'dir');
  const check = (name) => spawnSync(process.execPath, [checker], {
    cwd: join(root, name), encoding: 'utf8', timeout: 60000,
  });
  const success = (result) => {
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stdout + result.stderr);
  };
  success(check('producer'));

  await t.test('checks the consumer with built prerequisites and unchanged reruns', () => {
    success(check('consumer'));
    success(check('consumer'));
  });

  await t.test('detects changed public types even when producer source and intermediate types stay unchanged', () => {
    const intermediate = readFileSync(join(root, 'producer', '.typebuild', 'index.d.ts'), 'utf8');
    writeFileSync(published, 'export declare const value: number;\n');
    const result = check('consumer');
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /TS2322/);
    assert.equal(readFileSync(join(root, 'producer', '.typebuild', 'index.d.ts'), 'utf8'), intermediate);
  });

  await t.test('rechecks successfully after the public contract is restored', () => {
    writeFileSync(published, 'export declare const value: string;\n');
    success(check('consumer'));
  });

  await t.test('reports a missing distribution prerequisite instead of a cached success', () => {
    rmSync(published);
    const result = check('consumer');
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /TS2307/);
  });

  await t.test('preserves the last valid declarations when checking fails', () => {
    const declaration = join(root, 'consumer', '.typebuild', 'index.d.ts');
    const before = readFileSync(declaration, 'utf8');
    writeFileSync(published, 'export declare const value: string;\n');
    writeFileSync(source, "import { value } from 'producer'; export const checked: number = value;\n");
    const result = check('consumer');
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /TS2322/);
    assert.equal(readFileSync(declaration, 'utf8'), before);
  });
});
