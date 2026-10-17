import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { constants } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncLocalDistributions } from './sync-local-distributions.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const result = spawnSync('pnpm', ['list', '--recursive', '--depth', '-1', '--json'], {
  cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'],
});
if (result.error) throw result.error;
if (result.signal) process.exit(128 + constants.signals[result.signal]);
if (result.status === null) throw new Error('pnpm list finished without an exit status');
if (result.status !== 0) process.exit(result.status);
const projects = JSON.parse(result.stdout);
if (!Array.isArray(projects)) throw new Error('Expected pnpm workspace project list');
const records = new Map(projects.map(project => [project.name, {
  path: project.path,
  manifest: JSON.parse(readFileSync(resolve(project.path, 'package.json'), 'utf8')),
}]));
const selected = new Set();
function select(name) {
  if (selected.has(name)) return;
  const project = records.get(name);
  if (project === undefined) throw new Error(`Unknown workspace project: ${name}`);
  selected.add(name);
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
    if (project.manifest[field] === undefined) continue;
    for (const dependency of Object.keys(project.manifest[field])) {
      if (records.has(dependency)) select(dependency);
    }
  }
}
if (process.env.NX_TASK_TARGET_TARGET === 'test') {
  select(process.env.NX_TASK_TARGET_PROJECT);
} else {
  for (const name of records.keys()) select(name);
}
const injected = new Map();
for (const name of selected) {
  const { manifest } = records.get(name);
  if (manifest.dependenciesMeta === undefined) continue;
  for (const [dependency, metadata] of Object.entries(manifest.dependenciesMeta)) {
    if (metadata.injected !== true) continue;
    const source = records.get(dependency);
    if (source === undefined) throw new Error(`Injected dependency is not a workspace package: ${dependency}`);
    injected.set(dependency, { name: dependency, source: source.path });
  }
}
const count = syncLocalDistributions({
  modulesDirectory: resolve(root, 'node_modules'),
  packages: [...injected.values()], mode: 'workspace',
});
console.log(`Synced ${count} injected workspace distribution(s)`);
