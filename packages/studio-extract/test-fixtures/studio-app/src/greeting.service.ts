import { randomUUID } from 'node:crypto';

import { Injectable, inject } from '@zeltjs/core';
import { MemoryEventBusAdaptor } from '@zeltjs/eventbus';

import { ClockService } from './clock.service';
import './notification.events';
import { formatTime } from './time.lib';

@Injectable()
export class GreetingService {
  constructor(
    private clock = inject(ClockService),
    private eventBus = inject(MemoryEventBusAdaptor),
  ) {}

  greet(): string {
    const id = randomUUID();
    const message = `hello ${id} at ${formatTime(this.clock.now())}`;
    // レビュー指摘10: EventEdge のカバレッジ用(emit 側)。同じ event 名を購読する
    // NotificationHandler.startup と対応する
    void this.eventBus.emit('greeting:sent', { message });
    return message;
  }
}
