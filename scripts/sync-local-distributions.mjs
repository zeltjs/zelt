import {
  cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync,
  renameSync, rmSync,
} from 'node:fs';
import { join, sep } from 'node:path';

const readJson = path => JSON.parse(readFileSync(path, 'utf8'));

// Refresh every peer-context copy and keep the mutable source tree independent.
export function syncLocalDistributions({ modulesDirectory, packages, mode }) {
  if (mode !== 'integration' && mode !== 'workspace') throw new Error(`Unknown distribution sync mode: ${mode}`);
  const modules = realpathSync(modulesDirectory);
  const store = join(modules, '.pnpm');
  const contexts = readdirSync(store, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => join(store, entry.name, 'node_modules'));
  let count = 0;
  for (const { name, source } of packages) {
    const direct = join(modules, name);
    if (mode === 'integration' && !existsSync(direct)) {
      throw new Error(`Missing integration dependency: ${name}`);
    }
    const locations = new Set();
    if (existsSync(direct)) locations.add(realpathSync(direct));
    for (const context of contexts) {
      const candidate = join(context, name);
      if (existsSync(candidate)) locations.add(realpathSync(candidate));
    }
    for (const installed of locations) {
      if (mode === 'workspace' && installed === realpathSync(source)) continue;
      syncDistribution({ modules, installed, source, name });
      count += 1;
    }
  }
  return count;
}

function syncDistribution({ modules, installed, source, name }) {
  if (!installed.startsWith(modules + sep) || installed === realpathSync(source)) {
    throw new Error(`Expected an isolated installation for ${name}`);
  }
  const installedManifest = readJson(join(installed, 'package.json'));
  const sourceManifest = readJson(join(source, 'package.json'));
  if (installedManifest.name !== name || installedManifest.version !== sourceManifest.version) {
    throw new Error(`Installed package identity does not match ${name}`);
  }
  const staging = mkdtempSync(join(installed, '.zelt-dist-'));
  cpSync(join(source, 'dist'), join(staging, 'dist'), {
    recursive: true, verbatimSymlinks: true,
  });
  rmSync(join(installed, 'dist'), { recursive: true, force: true });
  renameSync(join(staging, 'dist'), join(installed, 'dist'));
  rmSync(staging, { recursive: true });
}
