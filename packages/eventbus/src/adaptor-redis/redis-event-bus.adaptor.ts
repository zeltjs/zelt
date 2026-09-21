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
  // Boxed (rather than a plain field) so the field itself stays readonly per
  // this module's DI-class convention; only the boxed promise is swapped.
  // Tracks the latest SUBSCRIBE sent on `sub` after startup so emit() can
  // await it: ioredis processes commands on a connection in order, so
  // waiting on the most recent subscribe also guarantees earlier ones on
  // this connection have already been acked by the server.
  private readonly pendingSubscribe: { current: Promise<unknown> } = {
    current: Promise.resolve(),
  };

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

  /**
   * @throws if a SUBSCRIBE issued by a post-startup on() call is still
   *   in flight and rejects (e.g. the connection drops before the server
   *   acks it).
   */
  async emit<K extends string & keyof EventBusSchema>(
    event: K,
    data: EventBusSchema[K],
  ): Promise<void> {
    // Without this, a publish issued right after a post-startup on() can
    // reach the server before that on()'s SUBSCRIBE is acked, so the
    // message is published to no one and the new subscriber never sees it.
    await this.pendingSubscribe.current;
    await this.pub.publish(event, JSON.stringify(data));
  }

  on<K extends string & keyof EventBusSchema>(
    event: K,
    handler: (data: EventBusSchema[K]) => void,
  ): () => void {
    const isNewSubscription = !this.subscriptions.has(event);
    if (isNewSubscription) {
      this.subscriptions.add(event);
    }
    this.localEmitter.on(event, handler);

    // Before startup() the lazy client sits in 'wait'; sending SUBSCRIBE then
    // would auto-connect and make startup()'s connect() reject as "already
    // connecting". startup() bulk-subscribes everything registered until then.
    // Once startup() has initiated the connection ioredis queues commands
    // across reconnects, so subscribing here is safe. 'end' means shutdown().
    const connectionInitiated = this.sub.status !== 'wait' && this.sub.status !== 'end';
    if (connectionInitiated && isNewSubscription) {
      // Stored (not fire-and-forgotten) so emit() can await this SUBSCRIBE
      // before publishing, closing the race where a publish right after
      // this on() reaches the server before the SUBSCRIBE is acked. The
      // extra .catch here only silences the unhandled-rejection warning
      // for callers who never emit() before the next on(); emit() still
      // awaits the original promise and propagates a rejection.
      this.pendingSubscribe.current = this.sub.subscribe(event);
      this.pendingSubscribe.current.catch(() => {});
    }

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
