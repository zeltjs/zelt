import { spawnSync } from 'node:child_process';

// Nx test targets already build their project and its dependencies before running this script.
if (process.env.NX_TASK_TARGET_TARGET !== 'test') {
  const build = spawnSync('pnpm', ['nx', 'run-many', '-t', 'build', '--projects=@zeltjs/*'], { stdio: 'inherit' });
  if (build.error) throw build.error;
  if (build.status !== 0) process.exit(build.status ?? 1);
}
