import type { Lifecycle } from '@zeltjs/core';
import { Injectable, inject, LifecycleManager } from '@zeltjs/core';
import { RedisService } from '@zeltjs/redis';
import type Redis from 'ioredis';
import mitt from 'mitt';

import type { EventBusAdaptor, EventBusSchema } from '../types';

@Injectable()
export class RedisEventBusAdaptor implements EventBusAdaptor, Lifecycle {
  private readonly pub: Redis;
  private readonly sub: Redis;
  private readonly localEmitter = mitt<EventBusSchema>();
  private readonly subscriptions = new Set<string>();

  constructor(redis = inject(RedisService), lifecycle = inject(LifecycleManager)) {
    this.pub = redis.client;
    this.sub = redis.client.duplicate();
    lifecycle.register(this);

    this.sub.on('message', (channel: string, message: string) => {
      if (!this.subscriptions.has(channel)) return;
      const data: unknown = JSON.parse(message);
      this.localEmitter.emit(channel, data);
    });
  }

  async startup(): Promise<void> {}

  async shutdown(): Promise<void> {
    this.sub.disconnect();
  }

  async emit<K extends string & keyof EventBusSchema>(
    event: K,
    data: EventBusSchema[K],
  ): Promise<void> {
    await this.pub.publish(event, JSON.stringify(data));
  }

  on<K extends string & keyof EventBusSchema>(
    event: K,
    handler: (data: EventBusSchema[K]) => void,
  ): () => void {
    if (!this.subscriptions.has(event)) {
      this.subscriptions.add(event);
      void this.sub.subscribe(event);
    }
    this.localEmitter.on(event, handler);

    return () => {
      this.localEmitter.off(event, handler);
    };
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
