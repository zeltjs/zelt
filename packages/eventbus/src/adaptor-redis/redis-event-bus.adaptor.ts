import type { Lifecycle } from '@zeltjs/core';
import { Injectable, inject, LifecycleManager } from '@zeltjs/core';
import { RedisService } from '@zeltjs/redis';
import type Redis from 'ioredis';
import mitt from 'mitt';

import type { EventBusAdaptor, EventBusSchema } from '../eventbus.types';

@Injectable()
export class RedisEventBusAdaptor implements EventBusAdaptor, Lifecycle {
  private readonly pub: Redis;
  private readonly sub: Redis;
  private readonly localEmitter = mitt<EventBusSchema>();
  private readonly subscriptions = new Set<string>();

  constructor(redis = inject(RedisService), lifecycle = inject(LifecycleManager)) {
    // redis.client is lazyConnect (no I/O yet); duplicate() copies that option,
    // so building the sub client and attaching the listener here is also I/O-free.
    this.pub = redis.client;
    this.sub = this.pub.duplicate();
    this.sub.on('message', (channel: string, message: string) => {
      if (!this.subscriptions.has(channel)) return;
      const data: unknown = JSON.parse(message);
      this.localEmitter.emit(channel, data);
    });
    lifecycle.register(this);
  }

  async startup(): Promise<void> {
    await this.sub.connect();
  }

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
