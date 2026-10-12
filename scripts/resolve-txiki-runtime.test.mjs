import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { resolveTxikiRuntime } from './resolve-txiki-runtime.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'zelt-txiki-discovery-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const bin = path.join(root, 'path');
  await mkdir(bin);
  async function executable(relative, source = '#!/bin/sh\nexit 0\n') {
    const file = path.join(root, relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, source);
    await chmod(file, 0o755);
    return file;
  }
  return { root, home, bin, executable, options: { env: { PATH: bin }, home } };
}

test('explicit TJS_BIN takes precedence over all discovery locations', async t => {
  const f = await fixture(t);
  await f.executable('path/tjs');
  const explicit = await f.executable('chosen runtime/tjs');
  assert.deepEqual(await resolveTxikiRuntime({ ...f.options, env: { PATH: f.bin, TJS_BIN: explicit } }), { ok: true, binary: explicit });
});

test('explicit command names are resolved on PATH', async t => {
  const f = await fixture(t);
  const binary = await f.executable('path/custom-tjs');
  assert.deepEqual(await resolveTxikiRuntime({ ...f.options, env: { PATH: f.bin, TJS_BIN: 'custom-tjs' } }), { ok: true, binary });
});

test('invalid or empty explicit TJS_BIN fails even when PATH tjs exists', async t => {
  const f = await fixture(t);
  await f.executable('path/tjs');
  for (const value of ['', path.join(f.root, 'missing')]) {
    const result = await resolveTxikiRuntime({ ...f.options, env: { PATH: f.bin, TJS_BIN: value } });
    assert.equal(result.ok, false);
    assert.match(result.error, /TJS_BIN=.*does not identify an executable/);
  }
});

test('PATH tjs precedes the bundled runtime', async t => {
  const f = await fixture(t);
  const binary = await f.executable('path/tjs');
  await f.executable('installation/bin/tjs');
  assert.deepEqual(await resolveTxikiRuntime({ ...f.options, env: { PATH: f.bin, TINYJS_HOME: path.join(f.root, 'installation') } }), { ok: true, binary });
});

test('TINYJS_HOME supports a custom installation without tjs on PATH', async t => {
  const f = await fixture(t);
  const binary = await f.executable('custom tinyjs/bin/tjs');
  assert.deepEqual(await resolveTxikiRuntime({ ...f.options, env: { PATH: f.bin, TINYJS_HOME: path.join(f.root, 'custom tinyjs') } }), { ok: true, binary });
});

test('tinyjs-only PATH finds its bundled tjs through the launcher symlink', async t => {
  const f = await fixture(t);
  const launcher = await f.executable('custom tinyjs/tinyjs');
  const binary = await f.executable('custom tinyjs/bin/tjs');
  await symlink(launcher, path.join(f.bin, 'tinyjs'));
  assert.deepEqual(await resolveTxikiRuntime(f.options), { ok: true, binary });
});

test('the default tinyjs installation is found without a launcher on PATH', async t => {
  const f = await fixture(t);
  const binary = await f.executable('home/.tinyjs/bin/tjs');
  assert.deepEqual(await resolveTxikiRuntime(f.options), { ok: true, binary });
});

test('directories and non-executable files cannot be selected as tjs', async t => {
  const f = await fixture(t);
  const file = await f.executable('not executable');
  await chmod(file, 0o644);
  for (const value of [file, f.bin]) {
    const result = await resolveTxikiRuntime({ ...f.options, env: { TJS_BIN: value } });
    assert.equal(result.ok, false);
  }
});

test('missing runtime reports checked paths and the command to configure it', async t => {
  const f = await fixture(t);
  const result = await resolveTxikiRuntime(f.options);
  assert.equal(result.ok, false);
  assert.match(result.error, /TJS_BIN=\/path\/to\/tjs pnpm verify:txiki/);
  assert.ok(result.error.includes(path.join(f.bin, 'tjs')));
  assert.ok(result.error.includes(path.join(f.home, '.tinyjs', 'bin', 'tjs')));
});

test('unexpected filesystem errors propagate rather than selecting another runtime', async t => {
  const f = await fixture(t);
  await symlink('tjs', path.join(f.bin, 'tjs'));
  await f.executable('home/.tinyjs/bin/tjs');
  await assert.rejects(resolveTxikiRuntime(f.options), { code: 'ELOOP' });
});

test('verifier reports a spawn failure once when an executable has a missing interpreter', async t => {
  const f = await fixture(t);
  const binary = await f.executable('broken-tjs', '#!/zelt-nonexistent-interpreter\n');
  const verifier = fileURLToPath(new URL('./verify-txiki-runtime.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [verifier], {
    env: { ...process.env, TJS_BIN: binary }, encoding: 'utf8', timeout: 30000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Failed to start txiki.js/);
  assert.equal((result.stderr.match(/Error: Failed to start txiki.js/g) ?? []).length, 1);
  assert.doesNotMatch(result.stderr, /triggerUncaughtException|UnhandledPromiseRejection/);
});
