import type { ZeltCommandExecutionError } from '../errors';

export type ExecResult =
  | { exitCode: 0 }
  | { exitCode: 1; readonly reason: ZeltCommandExecutionError };
