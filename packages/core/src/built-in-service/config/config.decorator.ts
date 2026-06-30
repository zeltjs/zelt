import { createConfigurableClassDecorator } from '@zeltjs/decorator-metadata';
import { createInjectableClassDecorator } from '../../kernel';
import { registerConfigClass } from './config-token.lib';

type ConfigOptions = {
  readonly abstract?: boolean;
};

const toConfigOptions = (value: unknown): ConfigOptions | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'object' || value === null) return undefined;
  return { abstract: Reflect.get(value, 'abstract') === true };
};

/** @throws {E} */
export const Config = createConfigurableClassDecorator<ConfigOptions>((rawOptions) =>
  createInjectableClassDecorator(
    toConfigOptions(rawOptions)?.abstract === true
      ? { decorator: 'Config', abstract: true }
      : { decorator: 'Config' },
    {
      afterApply: (cls) =>
        registerConfigClass(cls, { abstract: toConfigOptions(rawOptions)?.abstract === true }),
    },
    { unique: true },
  ),
);
