import { MemoryEventBusAdaptor } from '@zeltjs/eventbus';
import type { TestTargetResult } from '@zeltjs/testing';
import { createTestTarget } from '@zeltjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OrderHandlers } from './order.handlers';
import '../../domain/order.events';

const orderCreated = (orderId: number, userId: number) => ({
  orderId,
  userId,
  items: [{ productId: 1, quantity: 1 }],
});

describe('OrderHandlers (solitary: MemoryEventBusAdaptor replaced by a test-owned bus)', () => {
  let testTarget: TestTargetResult<OrderHandlers>;
  let handlers: OrderHandlers;
  let bus: MemoryEventBusAdaptor;
  let subscribedEvents: string[];

  beforeEach(async () => {
    bus = new MemoryEventBusAdaptor();
    subscribedEvents = [];
    const on = bus.on.bind(bus);
    vi.spyOn(bus, 'on').mockImplementation(async (event, handler) => {
      subscribedEvents.push(event);
      return on(event, handler);
    });

    testTarget = await createTestTarget(OrderHandlers, {
      overrides: [{ provide: MemoryEventBusAdaptor, useValue: bus }],
    });
    handlers = testTarget.target;
  });

  afterEach(async () => {
    await testTarget.shutdown();
  });

  it('subscribes to order:created once when the app starts it', () => {
    expect(subscribedEvents).toEqual(['order:created']);
  });

  it('starts with no notifications', () => {
    expect(handlers.notifications).toEqual([]);
  });

  it('records the order id and user id of each created order', async () => {
    await bus.emit('order:created', orderCreated(10, 1));

    expect(handlers.notifications).toEqual([{ orderId: 10, userId: 1 }]);
  });

  it('drops the ordered items from the notification', async () => {
    await bus.emit('order:created', {
      orderId: 11,
      userId: 2,
      items: [
        { productId: 1, quantity: 3 },
        { productId: 2, quantity: 1 },
      ],
    });

    expect(handlers.notifications[0]).toEqual({ orderId: 11, userId: 2 });
  });

  it('keeps notifications in emission order', async () => {
    await bus.emit('order:created', orderCreated(1, 1));
    await bus.emit('order:created', orderCreated(2, 2));
    await bus.emit('order:created', orderCreated(3, 1));

    expect(handlers.notifications.map((n) => n.orderId)).toEqual([1, 2, 3]);
  });

  it('stops recording after shutdown', async () => {
    await handlers.shutdown();

    await bus.emit('order:created', orderCreated(1, 1));

    expect(handlers.notifications).toEqual([]);
  });

  it('tolerates a second shutdown', async () => {
    await handlers.shutdown();

    await expect(handlers.shutdown()).resolves.toBeUndefined();
  });

  it('keeps notifications recorded before shutdown', async () => {
    await bus.emit('order:created', orderCreated(1, 1));

    await handlers.shutdown();

    expect(handlers.notifications).toEqual([{ orderId: 1, userId: 1 }]);
  });

  it('resubscribes when started again after shutdown', async () => {
    await handlers.shutdown();

    await handlers.startup();
    await bus.emit('order:created', orderCreated(5, 5));

    expect(subscribedEvents).toEqual(['order:created', 'order:created']);
    expect(handlers.notifications).toEqual([{ orderId: 5, userId: 5 }]);
  });

  it('subscribes again on a repeated startup and records duplicates (現状の振る舞い)', async () => {
    await handlers.startup();

    await bus.emit('order:created', orderCreated(1, 1));

    expect(handlers.notifications).toEqual([
      { orderId: 1, userId: 1 },
      { orderId: 1, userId: 1 },
    ]);
  });
});

describe('OrderHandlers (sociable: real MemoryEventBusAdaptor from the container)', () => {
  let testTarget: TestTargetResult<OrderHandlers>;
  let handlers: OrderHandlers;
  let bus: MemoryEventBusAdaptor;

  beforeEach(async () => {
    testTarget = await createTestTarget(OrderHandlers);
    handlers = testTarget.target;
    bus = await testTarget.get(MemoryEventBusAdaptor);
  });

  afterEach(async () => {
    await testTarget.shutdown();
  });

  it('records orders emitted on the shared bus', async () => {
    await bus.emit('order:created', orderCreated(1, 42));

    expect(handlers.notifications).toEqual([{ orderId: 1, userId: 42 }]);
  });

  it('ignores other subscribers unsubscribing', async () => {
    const unsubscribe = await bus.on('order:created', () => {});
    unsubscribe();

    await bus.emit('order:created', orderCreated(2, 1));

    expect(handlers.notifications).toEqual([{ orderId: 2, userId: 1 }]);
  });

  it('stops recording once the app shuts down', async () => {
    await testTarget.shutdown();

    await bus.emit('order:created', orderCreated(3, 1));

    expect(handlers.notifications).toEqual([]);
  });
});
