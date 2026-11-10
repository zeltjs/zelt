import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

export function preTasksExecution(_options, { workspaceRoot }) {
  const result = spawnSync(process.execPath, [
    '--no-warnings', join(workspaceRoot, 'scripts/verification-toolchain.mjs'),
  ], { cwd: workspaceRoot, stdio: ['ignore', 'ignore', 'inherit'] });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Verification diagnostics failed: status=${result.status}, signal=${result.signal}`);
  }
}
