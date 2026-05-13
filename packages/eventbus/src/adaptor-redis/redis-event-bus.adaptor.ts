import type { Lifecycle } from '@zeltjs/core';
import { inject, LifecycleManager } from '@zeltjs/core';
import { RedisService } from '@zeltjs/redis';
import type Redis from 'ioredis';

import type { EventBusAdaptor, EventBusSchema } from '../types';

type Handler = (data: unknown) => void;

export class RedisEventBusAdaptor implements EventBusAdaptor, Lifecycle {
  private readonly pub: Redis;
  private readonly sub: Redis;
  private readonly handlers = new Map<string, Set<Handler>>();

  constructor(redis = inject(RedisService), lifecycle = inject(LifecycleManager)) {
    this.pub = redis.client;
    this.sub = redis.client.duplicate();
    lifecycle.register(this);

    this.sub.on('message', (channel: string, message: string) => {
      const eventHandlers = this.handlers.get(channel);
      if (!eventHandlers) return;
      const data: unknown = JSON.parse(message);
      for (const handler of eventHandlers) {
        handler(data);
      }
    });
  }

  async startup(): Promise<void> {}

  async shutdown(): Promise<void> {
    this.sub.disconnect();
  }

  async emit<K extends keyof EventBusSchema>(event: K, data: EventBusSchema[K]): Promise<void> {
    await this.pub.publish(event as string, JSON.stringify(data));
  }

  on<K extends keyof EventBusSchema>(
    event: K,
    handler: (data: EventBusSchema[K]) => void,
  ): () => void {
    const channel = event as string;
    let handlers = this.handlers.get(channel);
    if (!handlers) {
      handlers = new Set();
      this.handlers.set(channel, handlers);
      void this.sub.subscribe(channel);
    }
    handlers.add(handler as Handler);

    return () => {
      handlers.delete(handler as Handler);
      if (handlers.size === 0) {
        this.handlers.delete(channel);
        void this.sub.unsubscribe(channel);
      }
    };
  }

  once<K extends keyof EventBusSchema>(
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
