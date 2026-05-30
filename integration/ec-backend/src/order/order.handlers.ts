import type { Lifecycle } from '@zeltjs/core';
import { Injectable, inject, LifecycleManager } from '@zeltjs/core';
import { MemoryEventBusAdaptor } from '@zeltjs/eventbus';

import './order.events';

@Injectable()
export class OrderHandlers implements Lifecycle {
  private unsubscribes: Array<() => void> = [];
  readonly notifications: Array<{ orderId: number; userId: number }> = [];

  constructor(
    private readonly eventBus = inject(MemoryEventBusAdaptor),
    lifecycle = inject(LifecycleManager),
  ) {
    lifecycle.register(this);
  }

  async startup(): Promise<void> {
    const unsub = this.eventBus.on('order:created', (data) => {
      this.notifications.push({
        orderId: data.orderId,
        userId: data.userId,
      });
    });
    this.unsubscribes.push(unsub);
  }

  async shutdown(): Promise<void> {
    for (const unsub of this.unsubscribes) {
      unsub();
    }
    this.unsubscribes = [];
  }
}
