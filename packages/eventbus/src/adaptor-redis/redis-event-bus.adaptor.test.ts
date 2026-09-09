import { LifecycleManager, ZeltLifecycleStateError } from '@zeltjs/core';
import type { RedisService } from '@zeltjs/redis';
import { describe, expect, it, vi } from 'vitest';

import { RedisEventBusAdaptor } from './redis-event-bus.adaptor';

type MessageListener = (channel: string, message: string) => void;

type FakeRedisClient = {
  publish: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  duplicate: ReturnType<typeof vi.fn>;
  emitMessage: (channel: string, message: string) => void;
};

const createFakeRedisClient = (): FakeRedisClient => {
  let messageListener: MessageListener | undefined;
  return {
    publish: vi.fn(async () => 1),
    subscribe: vi.fn(async () => undefined),
    on: vi.fn((event: string, listener: MessageListener) => {
      if (event === 'message') messageListener = listener;
    }),
    disconnect: vi.fn(),
    duplicate: vi.fn(),
    emitMessage: (channel, message) => messageListener?.(channel, message),
  };
};

const setup = () => {
  const pub = createFakeRedisClient();
  const sub = createFakeRedisClient();
  pub.duplicate.mockReturnValue(sub);
  const redis = { client: pub } as unknown as RedisService;
  return { redis, pub, sub };
};

describe('RedisEventBusAdaptor', () => {
  it('does not duplicate the redis client on construction', () => {
    const { redis, pub } = setup();

    new RedisEventBusAdaptor(redis, new LifecycleManager());

    expect(pub.duplicate).not.toHaveBeenCalled();
  });

  it('duplicates the client and attaches the message listener on startup', async () => {
    const { redis, pub, sub } = setup();
    const lifecycle = new LifecycleManager();
    new RedisEventBusAdaptor(redis, lifecycle);

    await lifecycle.startup();

    expect(pub.duplicate).toHaveBeenCalledTimes(1);
    expect(sub.on).toHaveBeenCalledWith('message', expect.any(Function));
  });

  it('throws ZeltLifecycleStateError when emit/on are called before startup', async () => {
    const { redis } = setup();
    const adaptor = new RedisEventBusAdaptor(redis, new LifecycleManager());

    await expect(adaptor.emit('order.created', { id: 1 })).rejects.toThrow(ZeltLifecycleStateError);
    expect(() => adaptor.on('order.created', () => {})).toThrow(ZeltLifecycleStateError);
  });

  it('subscribes to a channel once and delivers messages to all handlers', async () => {
    const { redis, sub } = setup();
    const lifecycle = new LifecycleManager();
    const adaptor = new RedisEventBusAdaptor(redis, lifecycle);
    await lifecycle.startup();

    const handler1 = vi.fn();
    const handler2 = vi.fn();
    adaptor.on('order.created', handler1);
    adaptor.on('order.created', handler2);

    expect(sub.subscribe).toHaveBeenCalledTimes(1);
    expect(sub.subscribe).toHaveBeenCalledWith('order.created');

    sub.emitMessage('order.created', JSON.stringify({ id: 1 }));

    expect(handler1).toHaveBeenCalledWith({ id: 1 });
    expect(handler2).toHaveBeenCalledWith({ id: 1 });
  });

  it('ignores messages for channels with no active subscription', async () => {
    const { redis, sub } = setup();
    const lifecycle = new LifecycleManager();
    const adaptor = new RedisEventBusAdaptor(redis, lifecycle);
    await lifecycle.startup();

    const handler = vi.fn();
    adaptor.on('order.created', handler);

    sub.emitMessage('order.cancelled', JSON.stringify({ id: 1 }));

    expect(handler).not.toHaveBeenCalled();
  });

  it('once() delivers only a single message and then stops', async () => {
    const { redis, sub } = setup();
    const lifecycle = new LifecycleManager();
    const adaptor = new RedisEventBusAdaptor(redis, lifecycle);
    await lifecycle.startup();

    const handler = vi.fn();
    adaptor.once('order.created', handler);

    sub.emitMessage('order.created', JSON.stringify({ id: 1 }));
    sub.emitMessage('order.created', JSON.stringify({ id: 2 }));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ id: 1 });
  });

  it('disconnects the duplicated client on shutdown', async () => {
    const { redis, sub } = setup();
    const lifecycle = new LifecycleManager();
    new RedisEventBusAdaptor(redis, lifecycle);
    await lifecycle.startup();

    await lifecycle.shutdown();

    expect(sub.disconnect).toHaveBeenCalledTimes(1);
  });
});
