import { Injectable } from '@zeltjs/core';
import mitt from 'mitt';

import type { EventBusAdaptor, EventBusSchema } from '../types';

@Injectable()
export class MemoryEventBusAdaptor implements EventBusAdaptor {
  private readonly emitter = mitt<EventBusSchema>();

  async emit<K extends string & keyof EventBusSchema>(
    event: K,
    data: EventBusSchema[K],
  ): Promise<void> {
    this.emitter.emit(event, data);
  }

  on<K extends string & keyof EventBusSchema>(
    event: K,
    handler: (data: EventBusSchema[K]) => void,
  ): () => void {
    this.emitter.on(event, handler);
    return () => this.emitter.off(event, handler);
  }

  once<K extends string & keyof EventBusSchema>(
    event: K,
    handler: (data: EventBusSchema[K]) => void,
  ): () => void {
    const wrappedHandler = (data: EventBusSchema[K]) => {
      unsubscribe();
      handler(data);
    };
    const unsubscribe = this.on(event, wrappedHandler);
    return unsubscribe;
  }
}
