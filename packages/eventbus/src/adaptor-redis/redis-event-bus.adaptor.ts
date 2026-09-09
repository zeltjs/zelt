import type { Lifecycle, ReadyValue } from '@zeltjs/core';
import { Injectable, inject, LifecycleManager } from '@zeltjs/core';
import { RedisService } from '@zeltjs/redis';
import type Redis from 'ioredis';
import mitt from 'mitt';

import type { EventBusAdaptor, EventBusSchema } from '../eventbus.types';

type RedisEventBusReady = {
  readonly pub: Redis;
  readonly sub: Redis;
};

@Injectable()
export class RedisEventBusAdaptor implements EventBusAdaptor, Lifecycle<RedisEventBusReady> {
  private readonly ready: ReadyValue<RedisEventBusReady>;
  private readonly localEmitter = mitt<EventBusSchema>();
  private readonly subscriptions = new Set<string>();

  constructor(
    private readonly redis = inject(RedisService),
    lifecycle = inject(LifecycleManager),
  ) {
    this.ready = lifecycle.register(this);
  }

  async startup(): Promise<RedisEventBusReady> {
    const pub = this.redis.client;
    const sub = pub.duplicate();

    sub.on('message', (channel: string, message: string) => {
      if (!this.subscriptions.has(channel)) return;
      const data: unknown = JSON.parse(message);
      this.localEmitter.emit(channel, data);
    });

    return { pub, sub };
  }

  async shutdown(): Promise<void> {
    this.ready.sub.disconnect();
  }

  async emit<K extends string & keyof EventBusSchema>(
    event: K,
    data: EventBusSchema[K],
  ): Promise<void> {
    await this.ready.pub.publish(event, JSON.stringify(data));
  }

  on<K extends string & keyof EventBusSchema>(
    event: K,
    handler: (data: EventBusSchema[K]) => void,
  ): () => void {
    if (!this.subscriptions.has(event)) {
      this.subscriptions.add(event);
      void this.ready.sub.subscribe(event);
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
