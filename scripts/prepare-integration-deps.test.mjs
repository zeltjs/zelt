import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  cpSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync,
  rmSync, statSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { syncLocalDistributions } from './sync-local-distributions.mjs';

const script = fileURLToPath(new URL('./prepare-integration-deps.mjs', import.meta.url));
const writeJson = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n');

test('cached artifacts refresh injected copies without running a package build hook', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'zelt-injected-dist-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, 'packages', 'sample');
  const modules = join(root, 'node_modules');
  const installed = join(modules, '.pnpm', 'context', 'node_modules', '@zeltjs', 'sample');
  mkdirSync(join(source, 'dist'), { recursive: true });
  mkdirSync(join(installed, 'dist'), { recursive: true });
  mkdirSync(join(modules, '@zeltjs'), { recursive: true });
  symlinkSync(source, join(modules, '@zeltjs', 'sample'), process.platform === 'win32' ? 'junction' : 'dir');
  const manifest = { name: '@zeltjs/sample', version: '1.0.0' };
  writeJson(join(source, 'package.json'), manifest);
  writeJson(join(installed, 'package.json'), manifest);
  const sourceFile = join(source, 'dist', 'index.js');
  const installedFile = join(installed, 'dist', 'index.js');
  writeFileSync(sourceFile, 'original');
  linkSync(sourceFile, installedFile);
  writeFileSync(sourceFile, 'typecheck output');
  writeFileSync(join(source, 'dist', 'restored.js'), 'published bundle');
  renameSync(join(source, 'dist', 'restored.js'), sourceFile);
  assert.equal(readFileSync(installedFile, 'utf8'), 'typecheck output');
  const packages = [{ name: '@zeltjs/sample', source }];
  assert.equal(syncLocalDistributions({ modulesDirectory: modules, packages, mode: 'workspace' }), 1);
  assert.equal(readFileSync(installedFile, 'utf8'), 'published bundle');
  writeFileSync(sourceFile, 'next typecheck');
  assert.equal(readFileSync(installedFile, 'utf8'), 'published bundle');
  assert.throws(() => syncLocalDistributions({ modulesDirectory: modules, packages, mode: 'integration' }), /isolated/);
});

// Real pnpm file: installation, lifecycle scripts, and filesystem payloads.
// The fixture has no registry dependencies, so it also works offline.
test('dist preparation reuses dependencies while refreshing consumer artifacts', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'zelt-prepare-dist-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const app = join(root, 'integration', 'consumer');
  const source = join(root, 'packages', 'sample');
  mkdirSync(app, { recursive: true });
  mkdirSync(join(source, 'dist'), { recursive: true });
  writeJson(join(root, 'package.json'), { private: true });
  writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages: []\n');
  writeFileSync(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n');
  const library = { name: '@zeltjs/sample', version: '1.0.0', main: 'dist/index.cjs', files: ['dist'] };
  writeJson(join(source, 'package.json'), library);
  writeFileSync(join(source, 'dist', 'index.cjs'), 'module.exports = 1;\n');
  const manifest = {
    private: true,
    dependencies: { '@zeltjs/sample': 'file:../../packages/sample' },
    scripts: { postinstall: 'node install.cjs' },
  };
  writeJson(join(app, 'package.json'), manifest);
  writeFileSync(join(app, 'install.cjs'), `
const fs = require('node:fs');
const count = fs.existsSync('install-count') ? Number(fs.readFileSync('install-count', 'utf8')) : 0;
fs.writeFileSync('install-count', String(count + 1));
`);
  const count = () => Number(readFileSync(join(app, 'install-count'), 'utf8'));
  const marker = join(app, 'node_modules', '.zelt-dist-preparation');
  const installedFile = () => join(realpathSync(join(app, 'node_modules', '@zeltjs', 'sample')), 'dist', 'index.cjs');
  const prepare = () => spawnSync(process.execPath, [script, app], {
    encoding: 'utf8', env: { ...process.env, npm_config_offline: 'true' }, timeout: 60000,
  });
  const success = () => {
    const result = prepare();
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    return result.stdout;
  };

  await t.test('installs once and reuses an unchanged dependency graph', () => {
    assert.match(success(), /Installing integration dependencies/);
    assert.equal(count(), 1);
    assert.match(success(), /Reusing integration dependencies/);
    assert.equal(count(), 1);
    assert.equal(readFileSync(installedFile(), 'utf8'), 'module.exports = 1;\n');
    assert.notEqual(statSync(installedFile()).ino, statSync(join(source, 'dist', 'index.cjs')).ino);
  });

  await t.test('refreshes changed or damaged payloads without reinstalling dependencies', () => {
    const peerCopy = join(app, 'node_modules', '.pnpm', 'peer-context', 'node_modules', '@zeltjs', 'sample');
    cpSync(join(installedFile(), '../..'), peerCopy, { recursive: true });
    writeFileSync(join(source, 'dist', 'index.cjs'), 'module.exports = 2;\n');
    success();
    assert.equal(count(), 1);
    assert.equal(readFileSync(installedFile(), 'utf8'), 'module.exports = 2;\n');
    assert.equal(readFileSync(join(peerCopy, 'dist', 'index.cjs'), 'utf8'), 'module.exports = 2;\n');
    writeFileSync(installedFile(), 'damaged copy');
    assert.equal(readFileSync(join(source, 'dist', 'index.cjs'), 'utf8'), 'module.exports = 2;\n');
    success();
    assert.equal(readFileSync(installedFile(), 'utf8'), 'module.exports = 2;\n');
    assert.equal(count(), 1);
    writeFileSync(join(source, 'dist', 'removed.cjs'), 'module.exports = 0;\n');
    success();
    const extra = join(installedFile(), '..', 'removed.cjs');
    assert.equal(existsSync(extra), true);
    rmSync(join(source, 'dist', 'removed.cjs'));
    success();
    assert.equal(existsSync(extra), false);
    assert.equal(count(), 1);
  });

  await t.test('reinstalls when a local package manifest changes', () => {
    library.version = '1.0.1';
    writeJson(join(source, 'package.json'), library);
    success();
    assert.equal(count(), 2);
  });

  await t.test('reinstalls when dependency resolution inputs change', () => {
    writeFileSync(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n# changed\n');
    success();
    assert.equal(count(), 3);
    writeFileSync(join(app, 'pnpm-lock.yaml'), readFileSync(join(app, 'pnpm-lock.yaml'), 'utf8') + '\n# changed\n');
    success();
    assert.equal(count(), 4);
  });

  await t.test('fails before modifying the installation when a distribution is missing', () => {
    renameSync(join(source, 'dist'), join(source, 'saved-dist'));
    const result = prepare();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Build the distribution/);
    assert.equal(count(), 4);
    assert.equal(readFileSync(installedFile(), 'utf8'), 'module.exports = 2;\n');
    renameSync(join(source, 'saved-dist'), join(source, 'dist'));
  });

  await t.test('does not mark a failed installation as reusable', () => {
    manifest.scripts.postinstall = 'node fail.cjs';
    writeFileSync(join(app, 'fail.cjs'), 'process.exit(23);\n');
    writeJson(join(app, 'package.json'), manifest);
    const result = prepare();
    assert.notEqual(result.status, 0);
    assert.equal(existsSync(marker), false);
    manifest.scripts.postinstall = 'node install.cjs';
    writeJson(join(app, 'package.json'), manifest);
    success();
    assert.equal(count(), 5);
  });
});
