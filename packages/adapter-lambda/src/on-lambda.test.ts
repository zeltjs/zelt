import type { ZeltPrebuilt } from '@zeltjs/core';
import { Controller, createApp, Get, http } from '@zeltjs/core';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import { LambdaEnvAdaptor } from './lambda-env.adaptor';
import { onLambda } from './on-lambda';

@Controller('/hello')
class HelloController {
  @Get('/')
  greet() {
    return { message: 'hello from lambda' };
  }
}

describe('onLambda', () => {
  it('initializes without HTTP and adds no adapter capabilities', async () => {
    const lambdaApp = await onLambda(createApp([]));
    try {
      expectTypeOf(lambdaApp).not.toHaveProperty('http');
      expectTypeOf(lambdaApp).not.toHaveProperty('handler');
      expectTypeOf(lambdaApp).not.toHaveProperty('handlerV1');
      expect(lambdaApp).not.toHaveProperty('handler');
      expect(lambdaApp).not.toHaveProperty('handlerV1');
    } finally {
      await lambdaApp.shutdown();
    }
  });

  it('preserves HTTP features named handler and handlerV1', async () => {
    const lambdaApp = await onLambda(
      createApp([
        http({ name: 'handler', controllers: [HelloController] }),
        http({ name: 'handlerV1', controllers: [HelloController] }),
      ]),
    );
    try {
      expect((await lambdaApp.handler.request('/hello')).status).toBe(200);
      expect((await lambdaApp.handlerV1.request('/hello')).status).toBe(200);
    } finally {
      await lambdaApp.shutdown();
    }
  });

  it('passes prebuilt to createRuntime()', async () => {
    const app = createApp([http({ controllers: [HelloController] })]);
    const readySpy = vi.spyOn(app, 'createRuntime');
    const prebuilt: ZeltPrebuilt = { version: 1, features: {} };

    const lambdaApp = await onLambda(app, { prebuilt });

    expect(readySpy).toHaveBeenCalledWith({
      prebuilt,
      fallbackConfigs: [LambdaEnvAdaptor],
      warmup: false,
    });

    await lambdaApp.shutdown();
  });
});
