import { Container, InjectionToken, injectable } from '@needle-di/core';

import { inject } from '../../kernel/di/inject';
import { resolve } from '../../kernel/di/resolve';
import { ZeltNotImplementedError } from '../../kernel/errors';
import type { Lifecycle } from '../../kernel/lifecycle';
import { LifecycleManager } from '../../kernel/lifecycle';
import type { Module } from '../module';
import type { SchedulerRunner } from './runner';
import { createSchedulerRunner } from './runner';

// --- Types ---

export type SchedulerClass = new (...args: never[]) => object;

export type SchedulerCapabilities = {
  readonly startScheduler: () => Promise<void>;
  readonly stopScheduler: () => Promise<void>;
};

// --- Token ---

export const SCHEDULER_OPTIONS = new InjectionToken<readonly SchedulerClass[]>('SCHEDULER_OPTIONS');

// --- Runtime ---

@injectable()
export class SchedulerRuntime implements Lifecycle {
  private runner: SchedulerRunner | undefined;

  constructor(
    private readonly schedulers: readonly SchedulerClass[] = inject(SCHEDULER_OPTIONS),
    private readonly container: Container = inject(Container),
    private readonly lifecycleManager: LifecycleManager = inject(LifecycleManager),
  ) {
    this.lifecycleManager.register(this);
  }

  /** @throws {ZeltNotImplementedError} */
  async startup(): Promise<void> {
    if (this.schedulers.length === 0) return;
    const resolver = {
      get: <T extends object>(cls: new (...args: never[]) => T): T => resolve(this.container, cls),
      getConfig: () => {
        throw new ZeltNotImplementedError({
          className: 'SchedulerRuntime',
          methodName: 'getConfig',
        });
      },
    };
    this.runner = createSchedulerRunner(this.schedulers, resolver);
  }

  async shutdown(): Promise<void> {
    await this.stopScheduler();
  }

  async startScheduler(): Promise<void> {
    if (this.runner && !this.runner.isRunning()) {
      await this.runner.startup();
    }
  }

  async stopScheduler(): Promise<void> {
    if (this.runner?.isRunning()) {
      await this.runner.shutdown();
    }
  }
}

// --- Module descriptor ---

export const SchedulerModule: Module<
  'schedulers',
  readonly SchedulerClass[],
  SchedulerCapabilities
> = {
  key: 'schedulers',
  bind: (container, schedulers) => {
    container.bind({ provide: SCHEDULER_OPTIONS, useValue: schedulers });
  },
  resolve: (container) => {
    const runtime = container.get(SchedulerRuntime);
    return {
      startScheduler: () => runtime.startScheduler(),
      stopScheduler: () => runtime.stopScheduler(),
    };
  },
};
