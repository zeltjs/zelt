import type { Lifecycle } from '@zeltjs/core';
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
export class DisposableSpy implements Lifecycle {
  shutdownCalls = 0;

  constructor(private readonly lifecycleManager: LifecycleManager = inject(LifecycleManager)) {
    this.lifecycleManager.register(this);
  }

  async startup(): Promise<void> {
    activeLog.current?.push({ source: 'disposable', phase: 'startup' });
  }

  async shutdown(): Promise<void> {
    this.shutdownCalls++;
    activeLog.current?.push({ source: 'disposable', phase: 'shutdown' });
  }
}

@Injectable()
export class WarmupSpy {
  warmupCalls = 0;

  recordWarmup(): void {
    this.warmupCalls++;
    activeLog.current?.push({ source: 'warmup', phase: 'warmup' });
  }
}
