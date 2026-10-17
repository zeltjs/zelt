export const env: Record<string, unknown> = {};
export const pendingTasks: Promise<unknown>[] = [];

export const waitUntil = (promise: Promise<unknown>): void => {
  pendingTasks.push(promise);
};
