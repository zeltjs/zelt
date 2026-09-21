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
  // Lets concurrent on() calls for the same not-yet-established channel share
  // one in-flight SUBSCRIBE, so the second caller's await reflects whether
  // that SUBSCRIBE actually succeeded instead of resolving early.
  private readonly subscribing = new Map<string, Promise<void>>();

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

  /**
   * @throws {Error} When the channel's SUBSCRIBE command to Redis fails,
   * whether this call sent it or joined another in-flight on() for the same
   * channel; the handler is not registered in that case.
   */
  async on<K extends string & keyof EventBusSchema>(
    event: K,
    handler: (data: EventBusSchema[K]) => void,
  ): Promise<() => void> {
    // Registered before any await, so a message that arrives while this call
    // is still waiting on SUBSCRIBE (below) or on startup()'s bulk subscribe
    // is not missed.
    this.localEmitter.on(event, handler);

    // Before startup() the lazy client sits in 'wait'; sending SUBSCRIBE then
    // would auto-connect and make startup()'s connect() reject as "already
    // connecting". startup() bulk-subscribes everything registered until then,
    // so resolve immediately here without waiting on that bulk subscribe.
    // Once startup() has initiated the connection ioredis queues commands
    // across reconnects, so subscribing here is safe. 'end' means shutdown().
    const connectionInitiated = this.sub.status !== 'wait' && this.sub.status !== 'end';
    if (!connectionInitiated) {
      this.subscriptions.add(event);
    } else if (!this.subscriptions.has(event)) {
      // Share one in-flight SUBSCRIBE across concurrent on() calls for the
      // same channel, so a second call's await reflects the same outcome as
      // the first instead of resolving before the channel is established.
      let subscribing = this.subscribing.get(event);
      if (!subscribing) {
        subscribing = this.sub
          .subscribe(event)
          .then(() => {
            this.subscriptions.add(event);
          })
          .finally(() => {
            this.subscribing.delete(event);
          });
        this.subscribing.set(event, subscribing);
      }

      try {
        await subscribing;
      } catch (error) {
        // Subscribing failed, so leave no trace of this call: a caller that
        // sees on() reject must be free to retry without a leaked handler.
        // `subscriptions` never gained this channel (add() only runs on
        // success above), so there is nothing to delete there.
        this.localEmitter.off(event, handler);
        throw error;
      }
    }

    return () => {
      this.localEmitter.off(event, handler);
    };
  }

  /** @throws {Error} Same as on(), which this delegates to. */
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
