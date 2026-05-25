import type { Lifecycle } from '@zeltjs/core';
import { Injectable, inject, LifecycleManager } from '@zeltjs/core';

import { activeLog } from './lifecycle-spy';

// DependencyB has no deps — its constructor runs first when DependencyA is resolved.
@Injectable()
export class DependencyB implements Lifecycle {
  constructor(private readonly lifecycleManager: LifecycleManager = inject(LifecycleManager)) {
    this.lifecycleManager.register(this);
  }

  async startup(): Promise<void> {
    activeLog.current?.push({ source: 'dependency-b', phase: 'startup' });
  }

  async shutdown(): Promise<void> {
    activeLog.current?.push({ source: 'dependency-b', phase: 'shutdown' });
  }
}

// DependencyA injects DependencyB, so DependencyB is constructed (and registered) first.
@Injectable()
export class DependencyA implements Lifecycle {
  constructor(
    public readonly b = inject(DependencyB),
    private readonly lifecycleManager: LifecycleManager = inject(LifecycleManager),
  ) {
    this.lifecycleManager.register(this);
  }

  async startup(): Promise<void> {
    activeLog.current?.push({ source: 'dependency-a', phase: 'startup' });
  }

  async shutdown(): Promise<void> {
    activeLog.current?.push({ source: 'dependency-a', phase: 'shutdown' });
  }
}

// Service that intentionally does NOT register with LifecycleManager.
// Verifies that services without lifecycle hooks coexist with lifecycle services.
@Injectable()
export class NoHookService {
  ping(): string {
    return 'pong';
  }
}
