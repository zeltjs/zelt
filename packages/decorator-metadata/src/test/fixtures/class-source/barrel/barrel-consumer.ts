import { createClassDecorator } from '../../../../index';

import { AliasedService, AnonymousDefaultService, PlainService, StarService } from './index.barrel';
import { DeepPlainService } from './nested.barrel';

const Service = createClassDecorator({ type: 'service' });
const inject = <T>(_cls: new (...args: never[]) => T): T => {
  return {} as T;
};

@Service
export class BarrelConsumer {
  // biome-ignore lint/complexity/noUselessConstructor: fixture for AST-based inject() extraction tests
  constructor(
    _a = inject(PlainService),
    _b = inject(AliasedService),
    _c = inject(StarService),
    _d = inject(DeepPlainService),
    _e = inject(AnonymousDefaultService),
  ) {}
}
