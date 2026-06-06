import type { ZeltCommandExecutionError } from '../../kernel';

export type ExecResult =
  | { exitCode: 0 }
  | { exitCode: 1; readonly reason: ZeltCommandExecutionError };
