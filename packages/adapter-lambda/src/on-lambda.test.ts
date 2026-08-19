import type { ZeltPrebuilt } from '@zeltjs/core';
import { Controller, createApp, Get, http } from '@zeltjs/core';
import { describe, expect, it, vi } from 'vitest';

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
