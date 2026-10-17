import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { stripVTControlCharacters } from 'node:util';

const workspace = fileURLToPath(new URL('../', import.meta.url));
const writeJson = (file, value) => writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
const success = (result) => {
  assert.equal(result.error, undefined, result.stdout + result.stderr);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return stripVTControlCharacters(result.stdout);
};

test('distribution caches track the actual prerequisite build output', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'zelt-distribution-cache-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  success(spawnSync('git', ['init', '--quiet', '--initial-branch=main'], {
    cwd: root, encoding: 'utf8',
    env: { ...process.env, GIT_DIR: undefined, GIT_WORK_TREE: undefined, GIT_INDEX_FILE: undefined },
  }));
  const project = join(root, 'packages', 'probe');
  mkdirSync(project, { recursive: true });
  mkdirSync(join(root, 'scripts'));
  symlinkSync(join(workspace, 'node_modules'), join(root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  for (const file of ['nx.json', 'pnpm-lock.yaml', 'scripts/pack-distribution.mjs']) {
    copyFileSync(join(workspace, file), join(root, file));
  }
  writeJson(join(root, 'package.json'), {
    name: 'distribution-cache-workspace', private: true,
    packageManager: 'pnpm@10.33.0', devDependencies: { nx: '21.6.10' },
  });
  writeJson(join(root, 'tsconfig.json'), {});
  writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n');
  writeFileSync(join(root, '.gitignore'), 'node_modules/\n.nx/\n**/dist/\n**/.artifacts/\n');
  writeJson(join(project, 'package.json'), {
    name: 'distribution-probe', version: '0.0.0', type: 'module', files: ['dist'],
  });
  writeJson(join(project, 'project.json'), {
    name: 'distribution-probe',
    targets: {
      build: { executor: 'nx:run-commands', options: { command: 'node build.mjs', cwd: 'packages/probe' } },
      distribution: { executor: 'nx:run-commands', options: { command: 'node ../../scripts/pack-distribution.mjs', cwd: 'packages/probe' } },
    },
  });
  writeFileSync(join(project, 'build.mjs'), "import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';\nmkdirSync('dist',{recursive:true});\nwriteFileSync('dist/index.js',readFileSync('../../scripts/pure-class-decorators.mjs'));\n");
  const tool = join(root, 'scripts', 'pure-class-decorators.mjs');
  writeFileSync(tool, 'export const marker = "before";\n');
  const toolTime = new Date();
  utimesSync(tool, toolTime, toolTime);
  const run = () => success(spawnSync(process.execPath, [
    join(workspace, 'node_modules', 'nx', 'bin', 'nx.js'), 'run', 'distribution-probe:distribution', '--outputStyle=static',
  ], {
    cwd: root, encoding: 'utf8', timeout: 60000,
    env: { ...process.env, NX_DAEMON: 'false', NX_ISOLATE_PLUGINS: 'false', npm_config_offline: 'true' },
  }));
  const archived = () => success(spawnSync('tar', [
    '-xOf', join(project, '.artifacts', 'current.tgz'), 'package/dist/index.js',
  ], { encoding: 'utf8' }));
  run();

  await t.test('unchanged builds reuse the distribution', () => {
    assert.match(run(), /distribution-probe:distribution.*\[local cache\]/);
    assert.equal(archived(), readFileSync(join(project, 'dist', 'index.js'), 'utf8'));
  });
  await t.test('changing only a build tool updates the archive', () => {
    writeFileSync(tool, 'export const marker = "after";\n');
    // Nx 21 compares whole-second mtimes on Linux and macOS when reusing file hashes.
    const changedTime = new Date(toolTime.getTime() + 2000);
    utimesSync(tool, changedTime, changedTime);
    run();
    assert.match(readFileSync(join(project, 'dist', 'index.js'), 'utf8'), /"after"/);
    assert.equal(archived(), readFileSync(join(project, 'dist', 'index.js'), 'utf8'));
  });
  await t.test('restoring missing archives preserves the current build', () => {
    rmSync(join(project, '.artifacts', 'current.tgz'));
    rmSync(join(project, '.artifacts', 'current.json'));
    assert.match(run(), /distribution-probe:distribution.*\[local cache\]/);
    assert.equal(archived(), readFileSync(join(project, 'dist', 'index.js'), 'utf8'));
  });
});
