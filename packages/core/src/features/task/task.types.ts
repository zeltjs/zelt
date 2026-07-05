export type Awaitable<T> = T | Promise<T>;

export type TaskFunction = () => Awaitable<void>;

export interface TaskOptions {
  readonly name?: string;
}

export type TaskFailureHandler = (taskName: string, error: unknown) => void;
