import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const workspace = fileURLToPath(new URL('../', import.meta.url));
const nxDirectory = join(workspace, 'node_modules/nx');
const nxManifest = JSON.parse(readFileSync(join(nxDirectory, 'package.json'), 'utf8'));
const writeJson = (file, value) => writeFileSync(file, JSON.stringify(value, null, 2) + '\n');

test('verification caches invalidate on sources, docs, tools and dependency changes', async (t) => {
  const temporaryRoot = join(workspace, '.tmp');
  mkdirSync(temporaryRoot, { recursive: true });
  const root = mkdtempSync(join(temporaryRoot, 'verification-cache-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const directory of ['scripts', 'website', 'packages/probe', 'tools/verification', '.tmp']) {
    mkdirSync(join(root, directory), { recursive: true });
  }
  symlinkSync(join(workspace, 'node_modules'), join(root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  cpSync(join(workspace, 'scripts'), join(root, 'scripts'), { recursive: true });
  for (const file of ['nx.json', 'pnpm-lock.yaml']) {
    copyFileSync(join(workspace, file), join(root, file));
  }
  writeJson(join(root, 'package.json'), {
    name: 'verification-cache-workspace', private: true,
    packageManager: 'pnpm@10.33.0', devDependencies: { nx: nxManifest.version },
  });
  writeJson(join(root, 'tsconfig.json'), {});
  writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n  - website\n');
  writeFileSync(join(root, '.gitignore'), 'node_modules/\n.nx/\n.tmp/\n**/dist/\n');
  writeFileSync(join(root, 'scripts/pure-class-decorators.mjs'), '// build tool\n');
  writeFileSync(join(root, 'packages/probe/source.txt'), 'source\n');
  writeJson(join(root, 'packages/probe/package.json'), { name: '@zeltjs/probe', private: true });
  writeJson(join(root, 'packages/probe/project.json'), {
    name: '@zeltjs/probe',
    targets: {
      build: {
        executor: 'nx:run-commands',
        inputs: ['default', { env: 'VERIFICATION_PROBE_BUILD' }],
        options: { command: 'node build.mjs', cwd: 'packages/probe' },
      },
    },
  });
  writeFileSync(join(root, 'packages/probe/build.mjs'),
    "import fs from 'node:fs';fs.mkdirSync('dist',{recursive:true});fs.writeFileSync('dist/index.js',fs.readFileSync('source.txt','utf8')+(process.env.VERIFICATION_PROBE_BUILD??''));\n");
  writeFileSync(join(root, 'scripts/verification-probe.mjs'), [
    "import fs from 'node:fs';",
    "import assert from 'node:assert/strict';",
    "import {fileURLToPath} from 'node:url';",
    "process.chdir(fileURLToPath(new URL('../',import.meta.url)));",
    "assert.equal(fs.readFileSync('packages/probe/dist/index.js','utf8'),fs.readFileSync('packages/probe/source.txt','utf8')+(process.env.VERIFICATION_PROBE_BUILD??''));",
    "fs.appendFileSync('.tmp/executions',process.env.NX_TASK_TARGET_TARGET+'\\n');",
    "if(fs.existsSync('.tmp/fail'))process.exit(1);",
  ].join('\n'));
  const verification = JSON.parse(readFileSync(join(workspace, 'tools/verification/project.json'), 'utf8'));
  for (const target of Object.values(verification.targets)) {
    target.options.command = 'node scripts/verification-probe.mjs';
  }
  writeJson(join(root, 'tools/verification/project.json'), verification);
  const website = JSON.parse(readFileSync(join(workspace, 'website/package.json'), 'utf8'));
  const docs = website.nx.targets['verify-docs'];
  docs.options.command = 'node scripts/verification-probe.mjs';
  writeJson(join(root, 'website/package.json'), { name: 'website', private: true, nx: { targets: { 'verify-docs': docs } } });
  const env = {
    ...process.env, NX_DAEMON: 'false', NX_ISOLATE_PLUGINS: 'false',
    NO_COLOR: '1', FORCE_COLOR: 'true',
    NX_CACHE_DIRECTORY: join(root, '.nx/cache'), NX_WORKSPACE_DATA_DIRECTORY: join(root, '.nx/workspace-data'),
    GIT_DIR: undefined, GIT_WORK_TREE: undefined, GIT_INDEX_FILE: undefined,
  };
  const git = spawnSync('git', ['init', '--quiet'], { cwd: root, env, encoding: 'utf8' });
  assert.equal(git.status, 0, git.stderr);
  const run = () => spawnSync(process.execPath, [
    join(nxDirectory, nxManifest.bin.nx), 'run-many', '-t', 'test-workspace', 'runtime-contracts', 'verify-docs',
    '--outputStyle=static', '--parallel=1',
    '--nxBail=false',
  ], { cwd: root, env, encoding: 'utf8', timeout: 60_000 });
  const success = () => {
    const result = run();
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    return result.stdout + result.stderr;
  };
  const targets = ['test-workspace', 'runtime-contracts', 'verify-docs'];
  const executions = () => {
    const lines = readFileSync(join(root, '.tmp/executions'), 'utf8').trim().split('\n');
    return Object.fromEntries(targets.map(target => [target, lines.filter(line => line === target).length]));
  };
  const assertExecutedOnce = (before, after) => {
    for (const target of targets) {
      assert.equal(after[target], before[target] + 1, `${target} must execute once`);
    }
  };
  success();
  assert.deepEqual(executions(), Object.fromEntries(targets.map(target => [target, 1])));
  const cached = success();
  assert.deepEqual(executions(), Object.fromEntries(targets.map(target => [target, 1])), `unchanged inputs must reuse all three results\n${cached}`);
  for (const [file, content] of [
    ['packages/probe/source.txt', 'changed source\n'],
    ['website/guide.md', 'changed docs\n'],
    ['scripts/tool.mjs', '// changed verification tool\n'],
    ['pnpm-lock.yaml', readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8') + '\n# changed lockfile\n'],
  ]) {
    const previous = executions();
    writeFileSync(join(root, file), content);
    success();
    assertExecutedOnce(previous, executions());
  }
  const beforeBuildChange = executions();
  env.VERIFICATION_PROBE_BUILD = 'different build output';
  success();
  assertExecutedOnce(beforeBuildChange, executions());

  const bin = join(root, '.tmp/bin');
  mkdirSync(bin);
  const pnpmProbe = "process.stderr.write('pnpm-probe-warning '+process.pid+'\\n');process.stdout.write('10.33.0\\n');\n";
  if (process.platform === 'win32') {
    writeFileSync(join(bin, 'pnpm-probe.cjs'), pnpmProbe);
    writeFileSync(join(bin, 'pnpm.cmd'), `@"${process.execPath}" "%~dp0pnpm-probe.cjs" %*\r\n`);
  } else {
    writeFileSync(join(bin, 'pnpm'), `#!${process.execPath}\n${pnpmProbe}`, { mode: 0o755 });
  }
  env.PATH = bin + delimiter + process.env.PATH;
  const probeToolchain = (args) => spawnSync(process.execPath, [
    '--no-warnings', join(root, 'scripts/verification-toolchain.mjs'), ...args,
  ], { cwd: root, env, encoding: 'utf8' });
  const diagnostics = probeToolchain([]);
  const fingerprint = probeToolchain(['--fingerprint']);
  assert.equal(diagnostics.status, 0, diagnostics.stderr);
  assert.equal(fingerprint.status, 0, fingerprint.stderr);
  assert.match(diagnostics.stderr, /pnpm-probe-warning/);
  assert.equal(fingerprint.stderr, '');
  assert.equal(diagnostics.stdout, fingerprint.stdout, 'diagnostics must not change the fingerprint');
  const beforeWarnings = executions();
  const firstWarning = success().match(/pnpm-probe-warning \d+/)?.[0];
  env.NX_ISOLATE_PLUGINS = 'true';
  const secondWarning = success().match(/pnpm-probe-warning \d+/)?.[0];
  assert.ok(firstWarning, 'warnings must be visible on a cache hit');
  assert.ok(secondWarning, 'warnings must remain visible on the next cache hit');
  assert.notEqual(firstWarning, secondWarning, 'diagnostics must run again rather than replaying an old warning');
  assert.deepEqual(executions(), beforeWarnings, 'changing warning PIDs must not invalidate cached verification');

  writeFileSync(join(root, '.tmp/fail'), 'fail');
  writeFileSync(join(root, 'website/guide.md'), 'invalid docs\n');
  const beforeFailure = executions();
  const firstFailure = run();
  assert.equal(firstFailure.error, undefined);
  assert.equal(firstFailure.status, 1, firstFailure.stdout + firstFailure.stderr);
  const failedExecutions = executions();
  assertExecutedOnce(beforeFailure, failedExecutions);
  const secondFailure = run();
  assert.equal(secondFailure.error, undefined);
  assert.equal(secondFailure.status, 1, secondFailure.stdout + secondFailure.stderr);
  assertExecutedOnce(failedExecutions, executions());
});
