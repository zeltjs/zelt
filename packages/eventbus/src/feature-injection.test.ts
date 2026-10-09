import {
  Command,
  CommandFeature,
  Controller,
  command,
  createApp,
  Get,
  http,
  Injectable,
  inject,
  injectFeature,
  LifecycleManager,
} from '@zeltjs/core';
import { describe, expect, it, vi } from 'vitest';
import { MemoryEventBusAdaptor } from './adaptor-memory';
import type { EventBusCapabilities } from './eventbus.feature';
import { EventBusFeature, eventbus } from './eventbus.feature';

describe('event feature injection', () => {
  it('subscribes at startup and shares events between HTTP, commands, handlers and the public API', async () => {
    const received = vi.fn();
    @Injectable()
    class Subscriber {
      private unsubscribe: (() => void) | undefined;
      constructor(
        private readonly events: EventBusCapabilities = injectFeature(bus),
        lifecycle = inject(LifecycleManager),
      ) {
        lifecycle.register({
          startup: async () => {
            this.unsubscribe = await this.events.on('message', received);
          },
          shutdown: () => {
            this.unsubscribe?.();
          },
        });
      }
    }
    const bus = eventbus({ adaptor: MemoryEventBusAdaptor, handlers: [Subscriber] });
    @Command({ name: 'publish' })
    class Publish {
      private readonly bus = injectFeature(EventBusFeature);
      async run() {
        await this.bus.emit('message', 'command');
      }
    }
    @Controller('/')
    class Api {
      private readonly bus = injectFeature(bus);
      private readonly commands = injectFeature(CommandFeature);
      @Get('/') async get() {
        await this.bus.emit('message', 'http');
        return this.commands.execCommand(['publish']);
      }
    }
    // The event handlers are realized first, before the features they may use.
    const definition = createApp([bus, command([Publish]), http({ controllers: [Api] })]);
    const first = await definition.createRuntime();
    const second = await definition.createRuntime();
    try {
      expect(received).not.toHaveBeenCalled();
      expect(await (await first.http.request('/')).json()).toEqual({ exitCode: 0 });
      await first.eventbus.emit('message', 'external');
      expect(received.mock.calls).toEqual([['http'], ['command'], ['external']]);
      await first.shutdown();
      await second.eventbus.emit('message', 'second runtime');
      expect(received.mock.calls).toEqual([
        ['http'],
        ['command'],
        ['external'],
        ['second runtime'],
      ]);
    } finally {
      await first.shutdown();
      await second.shutdown();
    }
  });
});
