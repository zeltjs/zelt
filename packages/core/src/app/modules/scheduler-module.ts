import type { SchedulerRunner } from '../../scheduler/runner';
import { createSchedulerRunner } from '../../scheduler/runner';
import type { Module, ReadyContext } from '../module';

export type SchedulerClass = new (...args: never[]) => object;

export type SchedulerModule = Module & {
  readonly getRunner: () => SchedulerRunner | undefined;
};

type SchedulerModuleState = {
  runner: SchedulerRunner | undefined;
  isDisposed: boolean;
};

export const createSchedulerModule = (schedulers: readonly SchedulerClass[]): SchedulerModule => {
  const state: SchedulerModuleState = {
    runner: undefined,
    isDisposed: false,
  };

  const setup = (): void => {};

  const ready = async (context: ReadyContext): Promise<void> => {
    if (schedulers.length === 0) return;
    state.runner = createSchedulerRunner(schedulers, context.resolver);
  };

  const shutdown = async (): Promise<void> => {
    if (state.runner?.isRunning()) {
      await state.runner.shutdown();
    }
    state.isDisposed = true;
  };

  const getRunner = (): SchedulerRunner | undefined => state.runner;

  return {
    setup,
    ready,
    shutdown,
    getRunner,
  };
};
