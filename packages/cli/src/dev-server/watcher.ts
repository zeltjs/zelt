import { watch } from 'chokidar';

export type WatcherOptions = {
  readonly cwd: string;
  readonly patterns: string[];
  readonly ignore: string[];
  readonly debounceMs: number;
  readonly onChange: () => void;
};

export type WatcherHandle = {
  readonly close: () => Promise<void>;
};

export const createWatcher = (options: WatcherOptions): WatcherHandle => {
  const { cwd, patterns, ignore, debounceMs, onChange } = options;

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  const watcher = watch(patterns, {
    cwd,
    ignored: ignore,
    ignoreInitial: true,
    persistent: true,
  });

  watcher.on('all', (_event, _path) => {
    if (debounceTimer !== undefined) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      debounceTimer = undefined;
      onChange();
    }, debounceMs);
  });

  return {
    close: async () => {
      if (debounceTimer !== undefined) {
        clearTimeout(debounceTimer);
      }
      await watcher.close();
    },
  };
};
