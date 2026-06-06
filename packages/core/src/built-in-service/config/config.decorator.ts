import { registerAsLeaf } from '../../kernel';
import { createInjectableClassDecorator } from '../../kernel';

export const Config = createInjectableClassDecorator(
  { decorator: 'Config' } as const,
  { afterApply: registerAsLeaf },
  { unique: true },
);
