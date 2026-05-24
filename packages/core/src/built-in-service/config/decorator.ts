import { registerAsLeaf } from '../../kernel/di/leaf';
import { createInjectableClassDecorator } from '../../kernel/internal/decorator-helpers';

export const Config = createInjectableClassDecorator(
  { decorator: 'Config' } as const,
  { afterApply: registerAsLeaf },
  { unique: true },
);
