import { onTest, shutdownAll } from '@zeltjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { app } from '../src/app';
import { AppConfig } from '../src/app-config';
import { BaseService, ExtendedService } from '../src/base.service';
import { ConfigConsumerService } from '../src/config-consumer.service';
import { CounterService } from '../src/counter.service';
import { LeafService } from '../src/leaf.service';
import { MiddleService } from '../src/middle.service';
import { RootService } from '../src/root.service';

describe('Injector', () => {
  let testApp: Awaited<ReturnType<typeof onTest>>;

  beforeAll(async () => {
    testApp = await onTest(app);
  });

  afterAll(async () => {
    await shutdownAll();
  });

  describe('constructor injection', () => {
    it('resolves a leaf service with no dependencies', async () => {
      const leaf = await testApp.get(LeafService);
      expect(leaf.value()).toBe('leaf');
    });

    it('resolves a service whose constructor depends on another service', async () => {
      const middle = await testApp.get(MiddleService);
      expect(middle.compose()).toBe('middle(leaf)');
    });

    it('resolves multi-level dependency chains', async () => {
      const root = await testApp.get(RootService);
      expect(root.compose()).toBe('root(middle(leaf),leaf)');
    });

    it('injects the same shared dependency into multiple constructor params', async () => {
      const root = await testApp.get(RootService);
      expect(root.leaf).toBe(root.middle.leaf);
    });
  });

  describe('singleton scope', () => {
    it('returns the same instance for every get() call', async () => {
      const a = await testApp.get(LeafService);
      const b = await testApp.get(LeafService);
      expect(a).toBe(b);
    });

    it('shares one instance across different consumer services', async () => {
      const root = await testApp.get(RootService);
      const middle = await testApp.get(MiddleService);
      const leaf = await testApp.get(LeafService);
      expect(root.leaf).toBe(leaf);
      expect(middle.leaf).toBe(leaf);
    });

    it('shares one instance across controllers via HTTP requests', async () => {
      const before = (await testApp.get(CounterService)).value();

      const res1 = await testApp.request('/counter-a/inc');
      expect(res1.status).toBe(200);
      const body1 = (await res1.json()) as { value: number };

      const res2 = await testApp.request('/counter-b/inc');
      expect(res2.status).toBe(200);
      const body2 = (await res2.json()) as { value: number };

      expect(body2.value).toBe(body1.value + 1);

      const res3 = await testApp.request('/counter-b/value');
      const body3 = (await res3.json()) as { value: number };
      expect(body3.value).toBe(before + 2);
    });
  });

  describe('controller injection via HTTP', () => {
    it('serves a controller that depends on a multi-level service graph', async () => {
      const res = await testApp.request('/chain');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ composed: 'root(middle(leaf),leaf)' });
    });
  });

  describe('Config (leaf) injection', () => {
    it('resolves a @Config() class via testApp.get', async () => {
      const config = await testApp.get(AppConfig);
      expect(config.appName).toBe('injector-test');
      expect(config.version).toBe(1);
    });

    it('returns the same Config instance on every resolve', async () => {
      expect(await testApp.get(AppConfig)).toBe(await testApp.get(AppConfig));
    });

    it('injects @Config() into a service constructor', async () => {
      const consumer = await testApp.get(ConfigConsumerService);
      expect(consumer.describe()).toBe('injector-test@1');
      expect(consumer.config).toBe(await testApp.get(AppConfig));
    });

    it('exposes injected Config through a controller endpoint', async () => {
      const res = await testApp.request('/config');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ description: 'injector-test@1' });
    });
  });

  describe('class inheritance', () => {
    it('resolves a subclass instance via testApp.get(SubClass)', async () => {
      const ext = await testApp.get(ExtendedService);
      expect(ext).toBeInstanceOf(ExtendedService);
      expect(ext).toBeInstanceOf(BaseService);
      expect(ext.kind()).toBe('extended');
      expect(ext.bonus()).toBe('bonus');
    });

    it('exposes the same instance for the subclass and its base when only the subclass is bound', async () => {
      const ext = await testApp.get(ExtendedService);
      const base = await testApp.get(BaseService);
      expect(base).toBe(ext);
      expect(base.kind()).toBe('extended');
    });

    it('serves a controller whose dependency is a subclass', async () => {
      const res = await testApp.request('/extended');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ kind: 'extended', bonus: 'bonus' });
    });
  });
});
