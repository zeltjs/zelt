import { registerAsLeaf } from '../di/leaf';
import { defineInjectableClassDecorator } from '../internal/decorator-helpers';

export const Config = defineInjectableClassDecorator(
  undefined,
  { decorator: 'Config' } as const,
  { afterApply: registerAsLeaf },
  { unique: true },
);
