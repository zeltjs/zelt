import { Injectable } from '@zeltjs/core';
import mitt from 'mitt';

import type { EventBusAdaptor, EventBusSchema } from '../eventbus.types';

@Injectable()
export class MemoryEventBusAdaptor implements EventBusAdaptor {
  private readonly emitter = mitt<EventBusSchema>();

  async emit<K extends string & keyof EventBusSchema>(
    event: K,
    data: EventBusSchema[K],
  ): Promise<void> {
    this.emitter.emit(event, data);
  }

  async on<K extends string & keyof EventBusSchema>(
    event: K,
    handler: (data: EventBusSchema[K]) => void,
  ): Promise<() => void> {
    this.emitter.on(event, handler);
    return () => this.emitter.off(event, handler);
  }

  async once<K extends string & keyof EventBusSchema>(
    event: K,
    handler: (data: EventBusSchema[K]) => void,
  ): Promise<() => void> {
    // Unsubscribes itself directly instead of going through on()'s returned
    // function, since that function only resolves after this handler is
    // already registered.
    const wrappedHandler = (data: EventBusSchema[K]) => {
      this.emitter.off(event, wrappedHandler);
      handler(data);
    };
    return this.on(event, wrappedHandler);
  }
}
