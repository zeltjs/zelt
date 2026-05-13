import { EventEmitter } from 'node:events';
import { Injectable } from '@zeltjs/core';

import type { EventBusAdaptor, EventBusSchema } from '../types';

@Injectable()
export class MemoryEventBusAdaptor implements EventBusAdaptor {
  private readonly emitter = new EventEmitter();

  async emit<K extends keyof EventBusSchema>(event: K, data: EventBusSchema[K]): Promise<void> {
    this.emitter.emit(event as string, data);
  }

  on<K extends keyof EventBusSchema>(
    event: K,
    handler: (data: EventBusSchema[K]) => void,
  ): () => void {
    this.emitter.on(event as string, handler);
    return () => this.emitter.off(event as string, handler);
  }

  once<K extends keyof EventBusSchema>(
    event: K,
    handler: (data: EventBusSchema[K]) => void,
  ): () => void {
    this.emitter.once(event as string, handler);
    return () => this.emitter.off(event as string, handler);
  }
}
