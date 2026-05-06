import { type ChildProcess, spawn } from 'node:child_process';

import consola from 'consola';

import type { DevConfig } from '../config/schema';

import { createWatcher, type WatcherHandle } from './watcher';

export type DevServerOptions = {
  readonly cwd: string;
  readonly config: DevConfig & { entry: string };
};

type DevServerState = {
  childProcess: ChildProcess | undefined;
  watcher: WatcherHandle | undefined;
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

const createShutdownHandler = (state: DevServerState) => {
  return async (): Promise<void> => {
    if (state.isShuttingDown) {
      return;
    }

    state.isShuttingDown = true;
    consola.info('Shutting down dev server...');

    if (state.watcher !== undefined) {
      await state.watcher.close();
    }

    if (state.childProcess !== undefined) {
      await killProcess(state.childProcess);
    }

    process.exit(0);
  };
};

const createRestartHandler = (state: DevServerState, cwd: string, entry: string) => {
  return async (): Promise<void> => {
    if (state.isShuttingDown) {
      return;
    }

    consola.info('File changed, restarting...');

    if (state.childProcess !== undefined) {
      await killProcess(state.childProcess);
    }

    state.childProcess = startProcess(cwd, entry);
  };
};

export const startDevServer = async (options: DevServerOptions): Promise<void> => {
  const { cwd, config } = options;

  const state: DevServerState = {
    childProcess: undefined,
    watcher: undefined,
    isShuttingDown: false,
  };

  const watchPatterns = config.watch ?? DEFAULT_WATCH_PATTERNS;
  const ignorePatterns = config.ignore ?? DEFAULT_IGNORE_PATTERNS;
  const debounceMs = config.debounceMs ?? 300;

  const shutdown = createShutdownHandler(state);
  const restart = createRestartHandler(state, cwd, config.entry);

  process.on('SIGINT', () => {
    void shutdown();
  });

  process.on('SIGTERM', () => {
    void shutdown();
  });

  state.watcher = createWatcher({
    cwd,
    patterns: watchPatterns,
    ignore: ignorePatterns,
    debounceMs,
    onChange: () => {
      void restart();
    },
  });

  state.childProcess = startProcess(cwd, config.entry);

  consola.success(`Dev server started. Watching for changes...`);
  consola.info(`  Entry: ${config.entry}`);
  consola.info(`  Watch: ${watchPatterns.join(', ')}`);
  consola.info(`  Ignore: ${ignorePatterns.join(', ')}`);
};
