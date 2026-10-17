import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync,
  rmSync, writeFileSync,
} from 'node:fs';
import { constants } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.signal) process.exit(128 + constants.signals[result.signal]);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const identityOf = (archive) => {
  const hash = createHash('sha256').update(readFileSync(archive)).digest('hex');
  return { tarball: `${hash}.tgz`, directory: `${hash}/package` };
};

// Only these current outputs belong to Nx. Historical immutable artifacts must
// not be included in every subsequent cache entry.
export function packDistribution(directory) {
  const root = resolve(directory);
  if (!existsSync(join(root, 'dist'))) throw new Error('Build dist before creating a distribution');
  const artifacts = join(root, '.artifacts');
  mkdirSync(artifacts, { recursive: true });
  const staging = mkdtempSync(join(artifacts, '.packing-'));
  try {
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    run('pnpm', ['pack', '--pack-destination', staging], root);
    const filename = `${manifest.name.replace('@', '').replace('/', '-')}-${manifest.version}.tgz`;
    const packed = join(staging, filename);
    const identity = identityOf(packed);
    writeFileSync(join(staging, 'current.json'), JSON.stringify(identity) + '\n');
    renameSync(packed, join(artifacts, 'current.tgz'));
    renameSync(join(staging, 'current.json'), join(artifacts, 'current.json'));
    return identity;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

// Run explicitly after Nx, whether it built or restored the current archive.
// This owns local artifacts only; pnpm exclusively owns installed dependencies.
export function materializeDistribution(directory) {
  const root = resolve(directory);
  const artifacts = join(root, '.artifacts');
  const archive = join(artifacts, 'current.tgz');
  const identity = identityOf(archive);
  const index = JSON.parse(readFileSync(join(artifacts, 'current.json'), 'utf8'));
  if (index.tarball !== identity.tarball || index.directory !== identity.directory) {
    throw new Error(`Distribution archive and index disagree: ${root}`);
  }
  const tarball = join(artifacts, identity.tarball);
  if (!existsSync(tarball)) copyFileSync(archive, tarball);
  const destination = join(artifacts, identity.directory, '..');
  if (!existsSync(destination)) {
    const staging = mkdtempSync(join(artifacts, '.unpacking-'));
    try {
      run('tar', ['-xzf', archive, '-C', staging], root);
      renameSync(staging, destination);
    } finally {
      rmSync(staging, { recursive: true, force: true });
    }
  }
  return identity;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length === 2) packDistribution(process.cwd());
  else if (process.argv.length === 3 && process.argv[2] === '--materialize') materializeDistribution(process.cwd());
  else throw new Error('Usage: pack-distribution.mjs [--materialize]');
}
