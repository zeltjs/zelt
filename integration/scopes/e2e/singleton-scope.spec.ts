import { onTest, shutdownAll } from '@zeltjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { app } from '../src/app';
import { CounterService } from '../src/counter.service';
import { ScopesController } from '../src/scopes.controller';

describe('Singleton (DEFAULT) scope', () => {
  let testApp: Awaited<ReturnType<(typeof app)['createRuntime']>>;
  let controllerCallsAtStart = 0;
  let serviceCallsAtStart = 0;

  beforeAll(async () => {
    controllerCallsAtStart = ScopesController.constructorCalls;
    serviceCallsAtStart = CounterService.constructorCalls;
    testApp = await onTest(app);
  });

  afterAll(async () => {
    await shutdownAll();
  });

  it('constructs the @Injectable() service exactly once for the whole app', async () => {
    await testApp.http.request('/scopes/singleton');
    await testApp.http.request('/scopes/singleton');
    await testApp.http.request('/scopes/singleton');

    expect(CounterService.constructorCalls - serviceCallsAtStart).toBe(1);
  });

  it('constructs the controller exactly once for the whole app', async () => {
    await testApp.http.request('/scopes/singleton');
    await testApp.http.request('/scopes/singleton');

    expect(ScopesController.constructorCalls - controllerCallsAtStart).toBe(1);
  });

  it('shares mutable state across requests because the singleton is reused', async () => {
    const beforeRes = await testApp.http.request('/scopes/singleton');
    const beforeBody = (await beforeRes.json()) as { value: number };

    const afterRes = await testApp.http.request('/scopes/singleton');
    const afterBody = (await afterRes.json()) as { value: number };

    expect(afterBody.value).toBe(beforeBody.value + 1);
  });
});
