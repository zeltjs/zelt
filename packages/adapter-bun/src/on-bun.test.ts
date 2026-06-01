import type { ConfiguredFeature, FeatureApp } from '@zeltjs/core';
import { cliSchema, command, createApp, http } from '@zeltjs/core';
import { describe, expectTypeOf, it } from 'vitest';

import type { onBun } from './on-bun';

const inferOnBunReturn = <const F extends readonly ConfiguredFeature[]>(
  app: FeatureApp<F>,
): Awaited<ReturnType<typeof onBun<F>>> => {
  void app;
  return undefined as never;
};

describe('onBun return types', () => {
  it('narrows adapter methods from configured features', () => {
    const httpFeature = http({ controllers: [] });
    const httpOnly = inferOnBunReturn(createApp([httpFeature]));

    expectTypeOf(httpOnly).toHaveProperty('serve');
    expectTypeOf(httpOnly).not.toHaveProperty('execCommand');

    class TestCommand {
      static schema = cliSchema({});
      run() {}
    }

    const commandFeature = command([TestCommand]);
    const commandOnly = inferOnBunReturn(createApp([commandFeature]));

    expectTypeOf(commandOnly).toHaveProperty('execCommand');
    expectTypeOf(commandOnly).not.toHaveProperty('serve');

    const full = inferOnBunReturn(createApp([httpFeature, commandFeature]));

    expectTypeOf(full).toHaveProperty('serve');
    expectTypeOf(full).toHaveProperty('execCommand');
  });
});
