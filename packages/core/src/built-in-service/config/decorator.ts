import { registerAsLeaf } from '../../kernel/di/leaf';
import { defineInjectableClassDecorator } from '../../kernel/internal/decorator-helpers';

export const Config = defineInjectableClassDecorator(
  undefined,
  { decorator: 'Config' } as const,
  { afterApply: registerAsLeaf },
  { unique: true },
);
