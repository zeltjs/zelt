// @zeltjs/eventbus の emit/subscribe を1組だけ持つ fixture。
// GreetingService.greet の emit と対になる購読側で、抽出器が event の対応を
// 見つけられることをカバーする
import { Injectable, inject } from '@zeltjs/core';
import { MemoryEventBusAdaptor } from '@zeltjs/eventbus';

import './notification.events';

@Injectable()
export class NotificationHandler {
  private unsubscribe: (() => void) | undefined;

  constructor(private readonly eventBus = inject(MemoryEventBusAdaptor)) {}

  subscribe(): void {
    this.unsubscribe = this.eventBus.on('greeting:sent', (data) => {
      this.record(data.message);
    });
  }

  unsubscribeAll(): void {
    this.unsubscribe?.();
  }

  record(message: string): void {
    console.log(message);
  }
}
