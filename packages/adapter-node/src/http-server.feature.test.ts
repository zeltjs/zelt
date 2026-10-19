import {
  Controller,
  createApp,
  Get,
  HttpFeature,
  HttpServerFeature,
  http,
  httpServer,
  Injectable,
  injectFeature,
  response,
  ZeltAppConfigurationError,
} from '@zeltjs/core';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { onNode } from './on-node';

describe('independent HTTP server feature', () => {
  it('shares HTTP identity across public namespaces, injection and feature entries', async () => {
    const web = http({ controllers: [] });
    @Injectable()
    class Consumer {
      readonly http = injectFeature(web);
    }
    const app = await onNode(createApp([web]));
    try {
      expectTypeOf(app).not.toHaveProperty('httpServer');
      expectTypeOf(app.http).not.toHaveProperty('listen');
      expect(app.http).not.toHaveProperty('serve');
      expect((await app.get(Consumer)).http).toBe(app.http);
      expect(app.getFeatureEntries(HttpFeature)[0]?.capabilities).toBe(app.http);
    } finally {
      await app.shutdown();
    }
  });

  it('serves distinct HTTP features and supports individual and runtime shutdown', async () => {
    @Controller('/')
    class PublicController {
      @Get('/') get() {
        return response().text('public');
      }
    }
    @Controller('/')
    class AdminController {
      @Get('/') get() {
        return response().text('admin');
      }
    }
    const app = await onNode(
      createApp([
        http({ name: 'public', controllers: [PublicController] }),
        http({ name: 'admin', controllers: [AdminController] }),
        httpServer(),
      ]),
    );
    try {
      expect(app).not.toHaveProperty('server');
      const publicServer = await app.httpServer.listen(app.public, {
        port: 0,
        hostname: '127.0.0.1',
      });
      const adminServer = await app.httpServer.listen(app.admin, {
        port: 0,
        hostname: '127.0.0.1',
      });
      const publicUrl = `http://127.0.0.1:${publicServer.address.port}/`;
      const adminUrl = `http://127.0.0.1:${adminServer.address.port}/`;
      expect(await (await fetch(publicUrl)).text()).toBe('public');
      expect(await (await fetch(adminUrl)).text()).toBe('admin');
      await publicServer.shutdown();
      await publicServer.closed;
      await expect(fetch(publicUrl)).rejects.toThrow();
      expect(await (await fetch(adminUrl)).text()).toBe('admin');
      await app.shutdown();
      await adminServer.closed;
      await expect(fetch(adminUrl)).rejects.toThrow();
    } finally {
      await app.shutdown();
    }
  });

  it('preserves an explicitly named server feature for public access and class injection', async () => {
    const listener = httpServer({ name: 'listener' });
    @Injectable()
    class Consumer {
      readonly listener = injectFeature(HttpServerFeature, 'listener');
    }
    const app = await onNode(createApp([http({ controllers: [] }), listener]));
    try {
      expectTypeOf(listener.key).toEqualTypeOf<'listener'>();
      expectTypeOf(app).not.toHaveProperty('httpServer');
      expect(app).not.toHaveProperty('httpServer');
      expect((await app.get(Consumer)).listener).toBe(app.listener);
      const server = await app.listener.listen(app.http, { port: 0, hostname: '127.0.0.1' });
      expect((await fetch(`http://127.0.0.1:${server.address.port}/`)).status).toBe(404);
    } finally {
      await app.shutdown();
    }
  });

  it('rejects a server feature when the runtime supplies no listening implementation', async () => {
    await expect(
      createApp([http({ controllers: [] }), httpServer()]).createRuntime(),
    ).rejects.toBeInstanceOf(ZeltAppConfigurationError);
  });
});
