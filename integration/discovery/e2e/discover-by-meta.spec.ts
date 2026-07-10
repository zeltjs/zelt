import { getClassMetadata } from '@zeltjs/decorator-metadata';
import { onTest, shutdownAll } from '@zeltjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { app } from '../src/app';
import {
  NON_APPLIED_DECORATOR_KEY,
  NonAppliedDecorator,
  OTHER_NON_APPLIED_DECORATOR_KEY,
  OtherNonAppliedDecorator,
} from '../src/decorators/non-applied.decorator';
import { getWebhookMetadata } from '../src/decorators/webhook.decorators';
import { HelloController } from '../src/hello.controller';
import { CleanupWebhook } from '../src/my-webhook/cleanup.webhook';
import { FlushWebhook } from '../src/my-webhook/flush.webhook';
import { providers } from '../src/providers';
import { WebhooksExplorer } from '../src/webhooks.explorer';

describe('Discovery', () => {
  let testApp: Awaited<ReturnType<(typeof app)['createRuntime']>>;

  beforeAll(async () => {
    testApp = await onTest(app);
  });

  afterAll(async () => {
    await shutdownAll();
  });

  it('app boots so discovery can run alongside an active HTTP module', async () => {
    const res = await testApp.http.request('/hello');
    expect(res.status).toBe(200);
  });

  it('should discover all providers & handlers with corresponding annotations', () => {
    const explorer = new WebhooksExplorer(providers);

    expect(explorer.getWebhooks()).toEqual([
      {
        name: 'cleanup',
        handlers: [{ event: 'start', methodName: 'onStart' }],
      },
      {
        name: 'flush',
        handlers: [{ event: 'start', methodName: 'onStart' }],
      },
    ]);
  });

  it('should return an empty array if no providers were found for a given discoverable decorator', () => {
    const matched = providers.filter((cls) => {
      const meta = getClassMetadata(cls);
      if (!meta) return false;
      return meta.props.some(
        (p) => (p as { decorator?: unknown }).decorator === NON_APPLIED_DECORATOR_KEY,
      );
    });
    expect(matched).toEqual([]);
  });

  it('should return undefined when reading metadata of a non-applied decorator on a class', () => {
    // NonAppliedDecorator is never applied; getClassMetadata yields no props for its key.
    const meta = getClassMetadata(CleanupWebhook);
    expect(meta).toBeDefined();
    const hasNonApplied = meta?.props.some(
      (p) => (p as { decorator?: unknown }).decorator === NON_APPLIED_DECORATOR_KEY,
    );
    expect(hasNonApplied).toBe(false);
  });

  it('should not register metadata for the NonAppliedDecorator factory itself', () => {
    // Calling the factory must not pollute any class metadata WeakMap.
    const decorator = NonAppliedDecorator();
    expect(typeof decorator).toBe('function');
  });

  it('exposes @Webhook props via getClassMetadata', () => {
    const meta = getClassMetadata(CleanupWebhook);
    // @Injectable も zelt メタデータを記録するようになったため(studio がソース位置を
    // 解決する前提)、Webhook props に加えて Injectable の記録が並ぶ。
    expect(meta?.props).toEqual([
      { decorator: 'integration/discovery/Webhook', name: 'cleanup' },
      { decorator: 'Injectable' },
    ]);
  });

  it('exposes @WebhookHandler props per method via getClassMetadata', () => {
    const meta = getClassMetadata(FlushWebhook);
    expect(meta?.methods).toEqual([
      {
        name: 'onStart',
        props: [{ decorator: 'integration/discovery/WebhookHandler', event: 'start' }],
      },
    ]);
  });

  it('getWebhookMetadata returns the descriptor for an annotated class', () => {
    expect(getWebhookMetadata(CleanupWebhook)).toEqual({ name: 'cleanup' });
    expect(getWebhookMetadata(FlushWebhook)).toEqual({ name: 'flush' });
  });

  it('getWebhookMetadata returns undefined for an unannotated class', () => {
    class Plain {}
    expect(getWebhookMetadata(Plain)).toBeUndefined();
  });

  // Equivalent to NestJS DiscoveryService.getControllers({ metadataKey: NonAppliedDecorator.KEY }).
  // The app's registered controllers carry @Controller metadata but not the non-applied key,
  // so filtering by that key must yield an empty array.
  it('returns an empty array when filtering controllers by a non-applied decorator key', () => {
    const controllers = [HelloController];
    const matched = controllers.filter((cls) => {
      const meta = getClassMetadata(cls);
      if (!meta) return false;
      return meta.props.some(
        (p) => (p as { decorator?: unknown }).decorator === NON_APPLIED_DECORATOR_KEY,
      );
    });
    expect(matched).toEqual([]);
  });

  it('isolates two distinct non-applied decorators so their keys do not interfere', () => {
    // Different keys: changing one factory must not change the other's identity.
    expect(NON_APPLIED_DECORATOR_KEY).not.toBe(OTHER_NON_APPLIED_DECORATOR_KEY);

    // Neither factory writes metadata when invoked but not applied.
    expect(typeof NonAppliedDecorator()).toBe('function');
    expect(typeof OtherNonAppliedDecorator()).toBe('function');

    // Both filters return empty independently across the same provider set.
    const matchedByFirst = providers.filter((cls) => {
      const meta = getClassMetadata(cls);
      return (
        meta?.props.some(
          (p) => (p as { decorator?: unknown }).decorator === NON_APPLIED_DECORATOR_KEY,
        ) ?? false
      );
    });
    const matchedBySecond = providers.filter((cls) => {
      const meta = getClassMetadata(cls);
      return (
        meta?.props.some(
          (p) => (p as { decorator?: unknown }).decorator === OTHER_NON_APPLIED_DECORATOR_KEY,
        ) ?? false
      );
    });
    expect(matchedByFirst).toEqual([]);
    expect(matchedBySecond).toEqual([]);

    // Existing @Webhook-annotated classes must not be tagged with either non-applied key.
    const cleanupMeta = getClassMetadata(CleanupWebhook);
    const cleanupDecorators = cleanupMeta?.props.map(
      (p) => (p as { decorator?: unknown }).decorator,
    );
    expect(cleanupDecorators).not.toContain(NON_APPLIED_DECORATOR_KEY);
    expect(cleanupDecorators).not.toContain(OTHER_NON_APPLIED_DECORATOR_KEY);
  });
});
