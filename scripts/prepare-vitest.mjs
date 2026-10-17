import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Nx test targets already build their project and its dependencies before running this script.
if (process.env.NX_TASK_TARGET_TARGET !== 'test') {
  const build = spawnSync('pnpm', ['nx', 'run', '@zeltjs/core:build'], { stdio: 'inherit' });
  if (build.error) throw build.error;
  if (build.status !== 0) process.exit(build.status ?? 1);
}

// Cache hits do not execute pnpm's build lifecycle hook for injected copies.
const sync = spawnSync(process.execPath, [fileURLToPath(new URL('./sync-injected-dist.mjs', import.meta.url))], { stdio: 'inherit' });
if (sync.error) throw sync.error;
process.exitCode = sync.status ?? 1;
