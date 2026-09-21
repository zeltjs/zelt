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
    try {
      await this.sub.connect();
      if (this.subscriptions.size > 0) {
        await this.sub.subscribe(...this.subscriptions);
      }
    } catch (error) {
      // ioredis keeps rescheduling reconnects via retryStrategy after a
      // rejected connect(), and LifecycleManager never calls shutdown() for
      // a lifecycle whose own startup() threw, so this is the only place
      // left to stop the socket/reconnect timer before rethrowing.
      this.sub.disconnect();
      throw error;
    }
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

  /** @throws {Error} When the channel is new and the SUBSCRIBE command to Redis fails; the handler is not registered in that case. */
  async on<K extends string & keyof EventBusSchema>(
    event: K,
    handler: (data: EventBusSchema[K]) => void,
  ): Promise<() => void> {
    const isNewSubscription = !this.subscriptions.has(event);
    if (isNewSubscription) {
      this.subscriptions.add(event);
    }
    this.localEmitter.on(event, handler);

    // Before startup() the lazy client sits in 'wait'; sending SUBSCRIBE then
    // would auto-connect and make startup()'s connect() reject as "already
    // connecting". startup() bulk-subscribes everything registered until then,
    // so resolve immediately here without waiting on that bulk subscribe.
    // Once startup() has initiated the connection ioredis queues commands
    // across reconnects, so subscribing here is safe. 'end' means shutdown().
    const connectionInitiated = this.sub.status !== 'wait' && this.sub.status !== 'end';
    if (connectionInitiated && isNewSubscription) {
      try {
        await this.sub.subscribe(event);
      } catch (error) {
        // Subscribing failed, so leave no trace of this call: a caller that
        // sees on() reject must be free to retry without a leaked handler
        // or a channel stuck in `subscriptions` with nothing subscribed.
        this.localEmitter.off(event, handler);
        this.subscriptions.delete(event);
        throw error;
      }
    }

    return () => {
      this.localEmitter.off(event, handler);
    };
  }

  /** @throws {Error} When the channel is new and the SUBSCRIBE command to Redis fails; the handler is not registered in that case. */
  async once<K extends string & keyof EventBusSchema>(
    event: K,
    handler: (data: EventBusSchema[K]) => void,
  ): Promise<() => void> {
    // Unsubscribes itself directly instead of going through on()'s returned
    // function, since that function only resolves after this handler is
    // already registered.
    const wrappedHandler = (data: EventBusSchema[K]) => {
      this.localEmitter.off(event, wrappedHandler);
      handler(data);
    };
    return this.on(event, wrappedHandler);
  }
}
