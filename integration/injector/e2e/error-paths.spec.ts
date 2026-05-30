import { Controller, createApp, Get, Injectable, inject } from '@zeltjs/core';
import { onTest, shutdownAll } from '@zeltjs/testing';
import { afterAll, describe, expect, it } from 'vitest';

// --- Fixtures ---

// Intentionally NOT decorated with @Injectable() so needle-di cannot auto-bind it.
class NotRegisteredService {
  value(): string {
    return 'never';
  }
}

@Injectable()
class ConsumerOfUnregistered {
  constructor(public readonly dep = inject(NotRegisteredService)) {}
}

@Injectable()
class OptionalDepConsumer {
  // @ts-expect-error Zelt inject() intentionally does not expose needle-di options.
  constructor(public readonly dep = inject(NotRegisteredService, { optional: true })) {}
}

@Injectable()
class SelfReferencingService {
  // Self-injection inside the same constructor must be detected by needle-di.
  // biome-ignore lint: intentional self-injection for circular-dependency test
  constructor(public readonly self: SelfReferencingService = inject(SelfReferencingService)) {}
}

@Controller('/broken')
class BrokenController {
  constructor(private readonly dep = inject(NotRegisteredService)) {}

  @Get('/')
  index() {
    return { value: this.dep.value() };
  }
}

// --- Tests ---

describe('Injector — DI error paths', () => {
  afterAll(async () => {
    await shutdownAll();
  });

  describe('unresolved dependency', () => {
    it('throws when inject() targets a class without @Injectable()', async () => {
      const app = createApp({ http: { controllers: [] } });
      const testApp = await onTest(app);

      expect(() => testApp.get(ConsumerOfUnregistered)).toThrow(/No provider/);
    });

    it('reports the missing token name in the error message', async () => {
      const app = createApp({ http: { controllers: [] } });
      const testApp = await onTest(app);

      expect(() => testApp.get(ConsumerOfUnregistered)).toThrow(/NotRegisteredService/);
    });
  });

  describe('self-injection', () => {
    it('detects a circular dependency when a service injects itself', async () => {
      const app = createApp({ http: { controllers: [] } });
      const testApp = await onTest(app);

      expect(() => testApp.get(SelfReferencingService)).toThrow(/[Cc]ircular/);
    });
  });

  describe('optional injection', () => {
    it('does not allow { optional: true } to bypass unresolved dependency errors', async () => {
      const app = createApp({ http: { controllers: [] } });
      const testApp = await onTest(app);

      expect(() => testApp.get(OptionalDepConsumer)).toThrow(/No provider/);
    });
  });

  describe('HTTP app readiness failure', () => {
    it('rejects app.ready({ warmup: true }) when a controller has an unresolvable dependency', async () => {
      const app = createApp({ http: { controllers: [BrokenController] } });

      // warmup eagerly resolves every controller, surfacing needle-di's "No provider(s) found".
      await expect(app.ready({ warmup: true })).rejects.toThrow(/No provider/);
      await app.shutdown();
    });

    it('fails the first request when a controller has an unresolvable dependency', async () => {
      const app = createApp({ http: { controllers: [BrokenController] } });
      const testApp = await onTest(app);

      // Without warmup, controller resolution is deferred until the first request hits its route.
      const res = await testApp.request('/broken');
      expect(res.status).toBe(500);
    });
  });
});
