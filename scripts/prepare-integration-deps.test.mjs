import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const pack = fileURLToPath(new URL('./pack-distribution.mjs', import.meta.url));
const prepare = fileURLToPath(new URL('./prepare-integration-deps.mjs', import.meta.url));
const json = (file) => JSON.parse(readFileSync(file, 'utf8'));
const writeJson = (file, value) => writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
const run = (script, args, cwd) => spawnSync(process.execPath, [script, ...args], {
  cwd, encoding: 'utf8', timeout: 60000,
  env: { ...process.env, npm_config_offline: 'true', PATH: dirname(process.execPath) + ':' + process.env.PATH },
});
const success = (result) => {
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stdout + result.stderr);
};

test('immutable distributions and pnpm preserve consumer isolation and mode resolution', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'zelt-distribution-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, 'sample');
  const app = join(root, 'consumer');
  mkdirSync(join(source, 'dist'), { recursive: true });
  mkdirSync(join(source, 'src'));
  mkdirSync(app);
  writeJson(join(source, 'package.json'), {
    name: '@zeltjs/sample', version: '1.0.0', files: ['dist'], main: 'dist/index.cjs',
  });
  writeFileSync(join(source, 'src', 'index.ts'), 'export const value = 1;\n');
  writeFileSync(join(source, 'dist', 'index.cjs'), 'module.exports = 1;\n');
  const packCurrent = () => {
    success(run(pack, [], source));
    success(run(pack, ['--materialize'], source));
    return json(join(source, '.artifacts', 'current.json'));
  };
  const first = packCurrent();
  const manifest = { private: true, dependencies: {} };
  const select = (mode, artifact) => {
    const file = mode === 'pack' ? artifact.tarball : artifact.directory;
    manifest.dependencies = { '@zeltjs/sample': `file:${join(source, '.artifacts', file)}` };
    writeJson(join(app, 'package.json'), manifest);
    return run(prepare, [app, mode], root);
  };
  const installed = () => join(realpathSync(join(app, 'node_modules', '@zeltjs', 'sample')), 'dist', 'index.cjs');
  const value = () => readFileSync(installed(), 'utf8');

  await t.test('identical builds retain the same artifact identity and omit source', () => {
    assert.deepEqual(packCurrent(), first);
    assert.equal(existsSync(join(source, '.artifacts', first.directory, 'src')), false);
    success(select('dist', first));
    assert.equal(value(), 'module.exports = 1;\n');
  });

  await t.test('restored archives recreate missing installable artifacts', () => {
    rmSync(join(source, '.artifacts', first.directory, '..'), { recursive: true });
    rmSync(join(source, '.artifacts', first.tarball));
    success(run(pack, ['--materialize'], source));
    assert.equal(readFileSync(join(source, '.artifacts', first.directory, 'dist', 'index.cjs'), 'utf8'), 'module.exports = 1;\n');
    assert.equal(value(), 'module.exports = 1;\n');
  });

  await t.test('changing build output never changes old artifacts or installed packages', () => {
    writeFileSync(join(source, 'dist', 'index.cjs'), 'module.exports = 2;\n');
    assert.equal(value(), 'module.exports = 1;\n');
    const next = packCurrent();
    assert.notEqual(next.tarball, first.tarball);
    assert.equal(readFileSync(join(source, '.artifacts', first.directory, 'dist', 'index.cjs'), 'utf8'), 'module.exports = 1;\n');
    assert.equal(value(), 'module.exports = 1;\n');
    success(select('dist', next));
    assert.equal(value(), 'module.exports = 2;\n');
  });

  await t.test('unchanged preparation invokes pnpm and retains the resolved lockfile', () => {
    const before = readFileSync(join(app, 'pnpm-lock.yaml'), 'utf8');
    const result = select('dist', json(join(source, '.artifacts', 'current.json')));
    success(result);
    assert.match(result.stdout, /Lockfile is up to date|Already up to date/);
    assert.equal(readFileSync(join(app, 'pnpm-lock.yaml'), 'utf8'), before);
    assert.equal(existsSync(join(app, 'node_modules', '.zelt-dist-preparation')), false);
  });

  await t.test('switching modes retains separate locks and installs the selected artifact', () => {
    success(select('pack', first));
    assert.equal(value(), 'module.exports = 1;\n');
    const packLock = readFileSync(join(app, '.zelt', 'locks', 'pack.yaml'), 'utf8');
    success(select('dist', json(join(source, '.artifacts', 'current.json'))));
    assert.equal(value(), 'module.exports = 2;\n');
    assert.equal(readFileSync(join(app, '.zelt', 'locks', 'pack.yaml'), 'utf8'), packLock);
  });

  await t.test('failed lifecycle scripts fail preparation without saving a successful lock', () => {
    const saved = join(app, '.zelt', 'locks', 'dist.yaml');
    const before = readFileSync(saved, 'utf8');
    manifest.scripts = { postinstall: 'node -e "process.exit(23)"' };
    const result = select('dist', first);
    assert.notEqual(result.status, 0);
    assert.equal(readFileSync(saved, 'utf8'), before);
  });
  await t.test('a missing build fails before replacing the distribution index', () => {
    const index = join(source, '.artifacts', 'current.json');
    const before = readFileSync(index, 'utf8');
    rmSync(join(source, 'dist'), { recursive: true });
    const result = run(pack, [], source);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Build dist/);
    assert.equal(readFileSync(index, 'utf8'), before);
  });

});
