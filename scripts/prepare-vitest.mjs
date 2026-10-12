import { spawnSync } from 'node:child_process';

// Nx test targets already build their project and its dependencies before running this script.
if (process.env.NX_TASK_TARGET_TARGET !== 'test') {
  const build = spawnSync('pnpm', ['nx', 'run', '@zeltjs/core:build'], { stdio: 'inherit' });
  if (build.error) throw build.error;
  process.exitCode = build.status ?? 1;
}
