import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { constants } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const config = JSON.parse(readFileSync(join(root, 'tsconfig.json'), 'utf8'));
// Keep the existing root tsconfig as the authoritative inspection scope.
const projects = config.references.map((reference) => {
  const manifest = JSON.parse(readFileSync(join(root, reference.path, 'package.json'), 'utf8'));
  if (typeof manifest.name !== 'string' || typeof manifest.scripts?.typecheck !== 'string') {
    throw new Error(`Expected a workspace typecheck target: ${reference.path}`);
  }
  return manifest.name;
});
const result = spawnSync('pnpm', [
  'nx', 'run-many', '-t', 'typecheck', `--projects=${projects.join(',')}`, '--parallel=2',
  ...process.argv.slice(2),
], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
if (result.signal) process.exit(128 + constants.signals[result.signal]);
process.exitCode = result.status ?? 1;
