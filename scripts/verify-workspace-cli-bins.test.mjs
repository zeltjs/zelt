import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const root = fileURLToPath(new URL('../', import.meta.url));
const exec = promisify(execFile);

test('workspace CLI bins survive installation before distribution files exist', { timeout: 360_000 }, async () => {
  const temporaryRoot = path.join(root, '.tmp');
  await mkdir(temporaryRoot, { recursive: true });
  const cwd = await mkdtemp(path.join(temporaryRoot, 'cold-cli-'));
  const run = async (args) => {
    const result = await exec('pnpm', args, {
      cwd, timeout: 240_000, maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, TMPDIR: temporaryRoot, NX_DAEMON: 'false' },
      shell: process.platform === 'win32',
    });
    return result.stdout;
  };
  try {
    const { stdout } = await exec('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root });
    for (const file of stdout.split('\0').filter(Boolean)) {
      const target = path.join(cwd, file);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(path.join(root, file), target);
    }
    await exec('git', ['init', '--quiet'], { cwd });
    await assert.rejects(access(path.join(cwd, 'packages/cli/dist/cli.js')), { code: 'ENOENT' });
    await assert.rejects(access(path.join(cwd, 'packages/hono-client/dist/cli.js')), { code: 'ENOENT' });
    await run(['install', '--frozen-lockfile', '--ignore-scripts', '--offline']);
    const bin = path.join(cwd, 'examples/tinyjs-desktop/node_modules/.bin');
    const extension = process.platform === 'win32' ? '.cmd' : '';
    await access(path.join(bin, `zelt${extension}`));
    await access(path.join(bin, `zelt-hono${extension}`));
    const generatedPath = path.join(cwd, 'examples/tinyjs-desktop/generated/app-type.ts');
    const backendPath = path.join(cwd, 'examples/tinyjs-desktop/backend/main.js');
    await assert.rejects(access(backendPath), { code: 'ENOENT' });
    await rm(generatedPath);
    await run(['nx', 'run', '@examples/tinyjs-desktop:build', '--skip-nx-cache', '--outputStyle=static']);
    const built = await readFile(generatedPath, 'utf8');
    await rm(generatedPath);
    await run(['--filter', '@examples/tinyjs-desktop', 'generate:client']);
    assert.equal(await readFile(generatedPath, 'utf8'), built);
    await run(['--filter', '@examples/tinyjs-desktop', 'typecheck']);
    await access(backendPath);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
