import { createInjectableClassDecorator, registerAsLeaf } from '../../kernel';

export const Config = createInjectableClassDecorator(
  { decorator: 'Config' } as const,
  { afterApply: registerAsLeaf },
  { unique: true },
);
