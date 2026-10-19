import type { HttpServerHandle } from '@zeltjs/core';
import {
  Command,
  Controller,
  command,
  createApp,
  Get,
  HttpFeature,
  HttpServerFeature,
  http,
  httpServer,
  injectFeature,
  response,
} from '@zeltjs/core';
import { describe, expect, it, vi } from 'vitest';
import { onNode } from './on-node';

describe('feature injection on Node', () => {
  it('starts independent named HTTP listeners from a command and closes them with the runtime', async () => {
    @Controller('/')
    class Admin {
      @Get('/') get() {
        return response().text('admin');
      }
    }
    @Controller('/')
    class User {
      @Get('/') get() {
        return response().text('user');
      }
    }
    const admin = http({ name: 'admin', controllers: [Admin] });
    const user = http({ name: 'user', controllers: [User] });
    const listeners: HttpServerHandle[] = [];
    @Command({ name: 'serve' })
    class Serve {
      private readonly admin = injectFeature(admin);
      private readonly user = injectFeature(HttpFeature, 'user');
      private readonly server = injectFeature(HttpServerFeature);
      async run() {
        listeners.push(await this.server.listen(this.admin, { port: 0, hostname: '127.0.0.1' }));
        listeners.push(await this.server.listen(this.user, { port: 0, hostname: '127.0.0.1' }));
      }
    }
    const printVersion = vi.fn();
    @Command({ name: '-v' })
    class Version {
      run() {
        printVersion();
      }
    }
    const app = await onNode(createApp([command([Serve, Version]), admin, user, httpServer()]));
    try {
      expect(listeners).toHaveLength(0);
      expect((await app.command.execCommand(['-v'])).exitCode).toBe(0);
      expect(printVersion).toHaveBeenCalledOnce();
      expect(listeners).toHaveLength(0);
      expect((await app.command.execCommand(['serve'])).exitCode).toBe(0);
      expect(listeners).toHaveLength(2);
      const [adminServer, userServer] = listeners;
      if (!adminServer || !userServer) throw new Error('Expected both listeners');
      expect(adminServer.address.port).not.toBe(userServer.address.port);
      expect(await (await fetch(`http://127.0.0.1:${adminServer.address.port}/`)).text()).toBe(
        'admin',
      );
      expect(await (await fetch(`http://127.0.0.1:${userServer.address.port}/`)).text()).toBe(
        'user',
      );
      expect(await (await app.admin.request('/')).text()).toBe('admin');
      await app.shutdown();
      await Promise.all(listeners.map((server) => server.closed));
      expect(() => app.httpServer.listen(app.admin, 0)).toThrow(/disposed/);
    } finally {
      await app.shutdown();
    }
  });
});
