import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';

import consola from 'consola';

import type { CliRuntime } from './cli-runtime.lib';
import type { DevConfig, ZeltConfig } from './config/config.types';
import {
  generateHttpInvocationArtifacts,
  invalidateHttpInvocationArtifacts,
} from './http-invocation-artifacts.lib';
import { runBuildHook, runPostBuildHooks, runPreBuildHooks } from './plugin-runner.lib';
import type { WatcherHandle } from './watcher.lib';
import { createWatcher } from './watcher.lib';

export type DevServerOptions = {
  readonly cwd: string;
  readonly config: ZeltConfig;
  readonly devConfig: DevConfig & { entry: string };
  readonly cliRuntime: Pick<CliRuntime, 'onSignal' | 'offSignal'>;
};

type DevServerState = {
  childProcess: ChildProcess | undefined;
  watcher: WatcherHandle | undefined;
  unregisterSignals: (() => void) | undefined;
  isShuttingDown: boolean;
};

const DEFAULT_WATCH_PATTERNS = ['./src/**/*.ts'];
const DEFAULT_IGNORE_PATTERNS = [
  '**/*.test.ts',
  '**/*.spec.ts',
  '**/dist/**',
  '**/node_modules/**',
];
const KILL_TIMEOUT_MS = 3000;

const killProcess = (child: ChildProcess): Promise<void> => {
  return new Promise((resolve) => {
    if (child.killed || child.exitCode !== null) {
      resolve();
      return;
    }

    const forceKillTimer = setTimeout(() => {
      if (!child.killed && child.exitCode === null) {
        consola.warn('Process did not exit gracefully, forcing kill...');
        child.kill('SIGKILL');
      }
    }, KILL_TIMEOUT_MS);

    child.once('exit', () => {
      clearTimeout(forceKillTimer);
      resolve();
    });

    child.kill('SIGTERM');
  });
};

const startProcess = (cwd: string, entry: string): ChildProcess => {
  consola.info(`Starting: tsx ${entry}`);

  const child = spawn('npx', ['tsx', entry], {
    cwd,
    stdio: 'inherit',
  });

  child.on('error', (err) => {
    consola.error('Failed to start process:', err.message);
  });

  child.on('exit', (code, signal) => {
    if (signal !== null) {
      consola.info(`Process terminated by signal: ${signal}`);
    } else if (code !== 0 && code !== null) {
      consola.error(`Process exited with code: ${code}`);
    }
  });

  return child;
};

/** @throws {ZeltMultipleBuildHooksError} */
const runHooks = async (cwd: string, config: ZeltConfig): Promise<void> => {
  const hookOptions = { cwd, config, loadStaticApp: async () => config.app() };

  try {
    await runPreBuildHooks(hookOptions);
  } catch (error) {
    await invalidateHttpInvocationArtifacts({ cwd });
    throw error;
  }

  let success = true;
  let hookError: unknown;
  let postBuildError: unknown;

  try {
    await generateHttpInvocationArtifacts(hookOptions);
    await runBuildHook(hookOptions);
  } catch (error) {
    success = false;
    hookError = error;
    await invalidateHttpInvocationArtifacts({ cwd });
  } finally {
    try {
      await runPostBuildHooks(hookOptions, { success });
    } catch (error) {
      postBuildError = error;
      await invalidateHttpInvocationArtifacts({ cwd });
    }
  }

  if (hookError !== undefined) {
    throw hookError;
  }
  if (postBuildError !== undefined) {
    throw postBuildError;
  }
};

const createShutdownHandler = (state: DevServerState) => {
  return async (): Promise<void> => {
    if (state.isShuttingDown) {
      return;
    }

    state.isShuttingDown = true;
    consola.info('Shutting down dev server...');

    state.unregisterSignals?.();
    state.unregisterSignals = undefined;

    if (state.watcher !== undefined) {
      await state.watcher.close();
    }

    if (state.childProcess !== undefined) {
      await killProcess(state.childProcess);
    }
  };
};

/** @throws {ZeltMultipleBuildHooksError} */
const createRestartHandler = (
  state: DevServerState,
  cwd: string,
  entry: string,
  config: ZeltConfig,
) => {
  return async (): Promise<void> => {
    if (state.isShuttingDown) {
      return;
    }

    consola.info('File changed, restarting...');

    if (state.childProcess !== undefined) {
      await killProcess(state.childProcess);
    }

    try {
      await runHooks(cwd, config);
    } catch (error) {
      consola.error('Plugin hook failed:', error);
    }

    state.childProcess = startProcess(cwd, entry);
  };
};

const registerSignalHandlers = (
  runtime: Pick<CliRuntime, 'onSignal' | 'offSignal'>,
  onSignal: () => Promise<void>,
): (() => void) => {
  const handler = (): void => {
    void onSignal();
  };

  runtime.onSignal('SIGINT', handler);
  runtime.onSignal('SIGTERM', handler);

  return () => {
    runtime.offSignal('SIGINT', handler);
    runtime.offSignal('SIGTERM', handler);
  };
};

/** @throws {ZeltMultipleBuildHooksError} */
export const startDevServer = async (options: DevServerOptions): Promise<void> => {
  const { cwd, config, devConfig, cliRuntime } = options;

  const state: DevServerState = {
    childProcess: undefined,
    watcher: undefined,
    unregisterSignals: undefined,
    isShuttingDown: false,
  };

  const watchPatterns = devConfig.watch ?? DEFAULT_WATCH_PATTERNS;
  const ignorePatterns = devConfig.ignore ?? DEFAULT_IGNORE_PATTERNS;
  const debounceMs = devConfig.debounceMs ?? 300;

  const shutdown = createShutdownHandler(state);
  const restart = createRestartHandler(state, cwd, devConfig.entry, config);

  state.unregisterSignals = registerSignalHandlers(cliRuntime, shutdown);

  state.watcher = createWatcher({
    cwd,
    patterns: watchPatterns,
    ignore: ignorePatterns,
    debounceMs,
    onChange: () => {
      void restart();
    },
  });

  try {
    await runHooks(cwd, config);
  } catch (error) {
    consola.error('Plugin hook failed:', error);
  }

  state.childProcess = startProcess(cwd, devConfig.entry);

  consola.success(`Dev server started. Watching for changes...`);
  consola.info(`  Entry: ${devConfig.entry}`);
  consola.info(`  Watch: ${watchPatterns.join(', ')}`);
  consola.info(`  Ignore: ${ignorePatterns.join(', ')}`);

  return new Promise(() => {
    // Keep the process running until signal received
  });
};
