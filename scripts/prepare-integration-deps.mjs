import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync, readFileSync, realpathSync, rmSync, writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { constants } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncLocalDistributions } from './sync-local-distributions.mjs';

// A dist-mode installation is reusable only for the same dependency inputs and
// runtime. Distribution files are refreshed independently, without hardlinks.
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

function runPnpm({ args, cwd, env, capture = false }) {
  const result = spawnSync('pnpm', args, {
    cwd, env, encoding: 'utf8', stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  });
  if (result.error) throw result.error;
  if (result.signal) process.exit(128 + constants.signals[result.signal]);
  if (result.status === null) throw new Error('pnpm finished without an exit status');
  if (result.status !== 0) process.exit(result.status);
  if (capture) return result.stdout.trim();
}

function localPackages({ appDir, rootDir, manifest }) {
  if (typeof manifest.dependencies !== 'object' || manifest.dependencies === null || Array.isArray(manifest.dependencies)) {
    throw new Error(`Missing integration dependencies: ${appDir}`);
  }
  return Object.entries(manifest.dependencies)
    .filter(([name]) => name.startsWith('@zeltjs/'))
    .map(([name, spec]) => {
      if (typeof spec !== 'string' || !spec.startsWith('file:')) {
        throw new Error(`Expected a local dist dependency: ${name}`);
      }
      const source = resolve(appDir, spec.slice('file:'.length));
      if (dirname(source) !== join(rootDir, 'packages')) {
        throw new Error(`Dist dependency is outside packages/: ${source}`);
      }
      if (readJson(join(source, 'package.json')).name !== name) {
        throw new Error(`Dist dependency name does not match ${name}`);
      }
      if (!existsSync(join(source, 'dist'))) {
        throw new Error(`Build the distribution before preparing ${name}`);
      }
      return { name, source };
    });
}

function dependencyKey({ appDir, rootDir, packages, pnpmVersion }) {
  const hash = createHash('sha256');
  hash.update(JSON.stringify({
    schema: 1, node: process.version, abi: process.versions.modules,
    platform: process.platform, arch: process.arch, pnpm: pnpmVersion,
    nativeBuild: [
      'CC', 'CXX', 'CFLAGS', 'CXXFLAGS', 'LDFLAGS', 'npm_config_arch',
      'npm_config_target', 'npm_config_runtime', 'npm_config_nodedir',
      'npm_config_disturl', 'npm_config_python', 'npm_config_libc',
    ].map(name => [name, process.env[name]]),
  }));
  const required = [
    join(rootDir, 'package.json'), join(rootDir, 'pnpm-lock.yaml'),
    join(rootDir, 'pnpm-workspace.yaml'), join(appDir, 'package.json'),
    fileURLToPath(import.meta.url),
    fileURLToPath(new URL('./sync-local-distributions.mjs', import.meta.url)),
    ...packages.map(pkg => join(pkg.source, 'package.json')),
  ];
  for (const path of required) hash.update(JSON.stringify([path, readFileSync(path, 'utf8')]));
  const optional = [
    join(rootDir, '.npmrc'), join(appDir, '.npmrc'),
  ];
  for (const path of optional) {
    hash.update(JSON.stringify([path, existsSync(path) ? readFileSync(path, 'utf8') : null]));
  }
  return hash.digest('hex');
}

function installationKey({ appDir, dependencies }) {
  const hash = createHash('sha256').update(dependencies);
  for (const path of [join(appDir, 'pnpm-lock.yaml'), join(appDir, 'node_modules', '.pnpm', 'lock.yaml')]) {
    hash.update(JSON.stringify([path, existsSync(path) ? readFileSync(path, 'utf8') : null]));
  }
  return hash.digest('hex');
}


if (process.argv.length !== 3) {
  throw new Error('Usage: node scripts/prepare-integration-deps.mjs <integration-directory>');
}
const appDir = realpathSync(resolve(process.argv[2]));
const rootDir = resolve(appDir, '../..');
if (dirname(appDir) !== join(rootDir, 'integration')) {
  throw new Error(`Expected a directory directly under integration/: ${appDir}`);
}
if (typeof process.env.PATH !== 'string') throw new Error('PATH is required to run pnpm');
const env = {
  ...process.env,
  PATH: dirname(process.execPath) + delimiter + process.env.PATH,
};
const manifest = readJson(join(appDir, 'package.json'));
const packages = localPackages({ appDir, rootDir, manifest });
const pnpmVersion = runPnpm({ args: ['--version'], cwd: appDir, env, capture: true });
const keyInputs = { appDir, rootDir, packages, pnpmVersion };
const dependencies = dependencyKey(keyInputs);
const marker = join(appDir, 'node_modules', '.zelt-dist-preparation');
const reusable = existsSync(marker) && readFileSync(marker, 'utf8') === installationKey({ appDir, dependencies });
rmSync(marker, { force: true });
if (reusable) {
  console.log('  Reusing integration dependencies');
} else {
  console.log('  Installing integration dependencies (inputs changed)');
  rmSync(join(appDir, 'node_modules'), { recursive: true, force: true });
  rmSync(join(appDir, 'pnpm-lock.yaml'), { force: true });
  runPnpm({ args: ['install', '--ignore-workspace'], cwd: appDir, env });
}
syncLocalDistributions({ modulesDirectory: join(appDir, 'node_modules'), packages, mode: 'integration' });
if ('better-sqlite3' in manifest.dependencies) {
  const require = createRequire(join(appDir, 'package.json'));
  const Database = require('better-sqlite3');
  const database = new Database(':memory:');
  database.close();
}
if (dependencyKey(keyInputs) !== dependencies) {
  throw new Error('Integration dependency inputs changed during preparation; run it again');
}
writeFileSync(marker, installationKey({ appDir, dependencies }));
console.log(`  Synced ${packages.length} local distribution(s)`);
