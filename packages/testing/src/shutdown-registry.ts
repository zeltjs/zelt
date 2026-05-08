type ShutdownFn = () => Promise<void>;

const shutdownFns: ShutdownFn[] = [];

export const registerShutdown = (fn: ShutdownFn): void => {
  shutdownFns.push(fn);
};

export const shutdownAll = async (): Promise<void> => {
  const fns = shutdownFns.splice(0);
  for (const fn of fns) {
    await fn();
  }
};
