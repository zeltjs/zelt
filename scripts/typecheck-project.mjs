import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { constants } from 'node:os';

// Nx orders projects. Program-level incremental checking validates imported
// declarations too; tsc --build may skip them when only published d.ts changed.
const compiler = createRequire(import.meta.url).resolve('typescript/bin/tsc');
const result = spawnSync(process.execPath, [
  compiler, '--project', 'tsconfig.json', '--incremental', '--noEmitOnError', ...process.argv.slice(2),
], { stdio: 'inherit' });
if (result.error) throw result.error;
if (result.signal) process.exit(128 + constants.signals[result.signal]);
process.exitCode = result.status ?? 1;
