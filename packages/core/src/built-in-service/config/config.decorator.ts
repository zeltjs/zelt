import { registerAsLeaf } from '../../kernel/di';
import { createInjectableClassDecorator } from '../../kernel/internal';

export const Config = createInjectableClassDecorator(
  { decorator: 'Config' } as const,
  { afterApply: registerAsLeaf },
  { unique: true },
);
