import { spawnSync } from 'node:child_process';

// Nx sets FORCE_COLOR, which can conflict with an inherited NO_COLOR. Version
// probes must not hash warnings containing a different process ID on every run.
const pnpm = spawnSync('pnpm', ['--version'], {
  encoding: 'utf8',
  env: { ...process.env, NO_COLOR: undefined, FORCE_COLOR: undefined },
  shell: process.platform === 'win32',
});
if (pnpm.error) throw pnpm.error;
if (pnpm.status !== 0) {
  process.stderr.write(pnpm.stderr);
  throw new Error(`pnpm version probe failed: status=${pnpm.status}, signal=${pnpm.signal}`);
}
console.log(JSON.stringify({
  node: process.version,
  pnpm: pnpm.stdout.trim(),
  platform: process.platform,
  arch: process.arch,
}));
