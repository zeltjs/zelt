import { createSchedulerRunner, type SchedulerRunner } from '../../scheduler/runner';
import type { Module, ReadyContext } from '../module';

export type SchedulerClass = new (...args: never[]) => object;

type SchedulerModuleState = {
  runner: SchedulerRunner | undefined;
  isDisposed: boolean;
};

export const createSchedulerModule = (schedulers: readonly SchedulerClass[]): Module => {
  const state: SchedulerModuleState = {
    runner: undefined,
    isDisposed: false,
  };

  const setup = (): void => {
    // scheduler module has no setup logic
  };

  const ready = async (context: ReadyContext): Promise<void> => {
    if (schedulers.length === 0) return;

    const runner = createSchedulerRunner(schedulers, context.resolver);
    context.lifecycle.register(runner);
    state.runner = runner;
  };

  const shutdown = async (): Promise<void> => {
    state.isDisposed = true;
  };

  return {
    setup,
    ready,
    shutdown,
  };
};
