import { createApp } from '@zeltjs/core';
import { onTest, shutdownAll } from '@zeltjs/testing';
import { afterAll, describe, expect, it } from 'vitest';

import { AppConfig } from '../src/app-config';
import { ConfigController } from '../src/config.controller';
import { ConfigConsumerService } from '../src/config-consumer.service';
import { TestAppConfig } from '../src/test-app-config';

const makeApp = () =>
  createApp({
    http: { controllers: [ConfigController] },
    configs: [AppConfig],
  });

describe('Injector — Config override', () => {
  afterAll(async () => {
    await shutdownAll();
  });

  it('returns the original Config when no override is supplied', async () => {
    const testApp = await onTest(makeApp());
    expect((await testApp.get(AppConfig)).appName).toBe('injector-test');
    expect((await testApp.get(AppConfig)).version).toBe(1);
  });

  it('substitutes the Config with a subclass passed via onTest({ configs })', async () => {
    const testApp = await onTest(makeApp(), { configs: [TestAppConfig] });

    expect((await testApp.get(AppConfig)).appName).toBe('override-name');
    expect((await testApp.get(AppConfig)).version).toBe(999);
    expect((await testApp.get(ConfigConsumerService)).describe()).toBe('override-name@999');
  });

  it('propagates the overridden Config through the controller endpoint', async () => {
    const testApp = await onTest(makeApp(), { configs: [TestAppConfig] });

    const res = await testApp.request('/config');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ description: 'override-name@999' });
  });
});
