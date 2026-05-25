import type { Disposable, Lifecycle } from '@zeltjs/core';
import { Injectable, inject, LifecycleManager } from '@zeltjs/core';

export type SpyEvent = {
  readonly source: string;
  readonly phase: 'startup' | 'shutdown' | 'warmup';
};

export const createEventLog = () => {
  const events: SpyEvent[] = [];
  return {
    events,
    push: (event: SpyEvent) => events.push(event),
    clear: () => {
      events.length = 0;
    },
  };
};

export type EventLog = ReturnType<typeof createEventLog>;

// Spy services push to whichever log is "active" when they fire. Each spec uses a fresh app
// instance with its own log, and assigns it here before calling ready().
export const activeLog: { current: EventLog | undefined } = { current: undefined };

@Injectable()
export class FirstSpy implements Lifecycle {
  startupCalls = 0;
  shutdownCalls = 0;

  constructor(private readonly lifecycleManager: LifecycleManager = inject(LifecycleManager)) {
    this.lifecycleManager.register(this);
  }

  async startup(): Promise<void> {
    this.startupCalls++;
    activeLog.current?.push({ source: 'first', phase: 'startup' });
  }

  async shutdown(): Promise<void> {
    this.shutdownCalls++;
    activeLog.current?.push({ source: 'first', phase: 'shutdown' });
  }
}

@Injectable()
export class SecondSpy implements Lifecycle {
  startupCalls = 0;
  shutdownCalls = 0;

  constructor(private readonly lifecycleManager: LifecycleManager = inject(LifecycleManager)) {
    this.lifecycleManager.register(this);
  }

  async startup(): Promise<void> {
    this.startupCalls++;
    activeLog.current?.push({ source: 'second', phase: 'startup' });
  }

  async shutdown(): Promise<void> {
    this.shutdownCalls++;
    activeLog.current?.push({ source: 'second', phase: 'shutdown' });
  }
}

@Injectable()
export class DisposableSpy implements Disposable {
  shutdownCalls = 0;

  // Disposable has no startup, but LifecycleManager only accepts Lifecycle.
  // We bridge with an inline no-op startup so the shutdown side is still registered in order.
  constructor(private readonly lifecycleManager: LifecycleManager = inject(LifecycleManager)) {
    this.lifecycleManager.register({
      startup: async () => {
        activeLog.current?.push({ source: 'disposable', phase: 'startup' });
      },
      shutdown: () => this.shutdown(),
    });
  }

  async shutdown(): Promise<void> {
    this.shutdownCalls++;
    activeLog.current?.push({ source: 'disposable', phase: 'shutdown' });
  }
}

@Injectable()
export class WarmupSpy {
  warmupCalls = 0;

  constructor(private readonly lifecycleManager: LifecycleManager = inject(LifecycleManager)) {
    this.lifecycleManager.registerWarmup(async () => {
      this.warmupCalls++;
      activeLog.current?.push({ source: 'warmup', phase: 'warmup' });
    });
  }
}
