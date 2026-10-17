import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { constants } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Each mode retains its own lockfile. pnpm reconciles the active installation
// against that graph; source paths stay stable for the Studio inspection.
function runInstall(appDir, args) {
  const result = spawnSync('pnpm', ['install', '--ignore-workspace', ...args], {
    cwd: appDir, stdio: 'inherit',
    env: { ...process.env, PATH: dirname(process.execPath) + delimiter + process.env.PATH },
  });
  if (result.error) throw result.error;
  if (result.signal) process.exit(128 + constants.signals[result.signal]);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

export function prepareIntegrationDependencies({ appDir, mode }) {
  if (!['dist', 'pack', 'public'].includes(mode)) throw new Error(`Unknown integration mode: ${mode}`);
  const manifest = JSON.parse(readFileSync(join(appDir, 'package.json'), 'utf8'));
  if (!manifest.private) throw new Error('Expected a private integration consumer');
  const locks = join(appDir, '.zelt', 'locks');
  const saved = join(locks, `${mode}.yaml`);
  const active = join(appDir, 'pnpm-lock.yaml');
  mkdirSync(locks, { recursive: true });
  if (existsSync(saved)) copyFileSync(saved, active);
  else rmSync(active, { force: true });
  // Resolve a new local artifact against this mode's existing dependency choices,
  // then install exactly the resulting lockfile. No dependency files are patched.
  runInstall(appDir, ['--lockfile-only', '--no-frozen-lockfile']);
  runInstall(appDir, ['--frozen-lockfile']);
  copyFileSync(active, saved);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 4) throw new Error('Usage: prepare-integration-deps.mjs <app-directory> <mode>');
  prepareIntegrationDependencies({ appDir: resolve(process.argv[2]), mode: process.argv[3] });
}
