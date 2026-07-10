import { createClassDecorator } from '../../../index';

import DefaultDep from './default-dep';
import { AliasedService, ExportedService } from './exported';

const Service = createClassDecorator({ type: 'service' });
const inject = <T>(_cls: new (...args: never[]) => T): T => {
  return {} as T;
};

@Service
class LocalDep {}

export { LocalDep as PublicLocalDep };

@Service
export class Consumer {
  // biome-ignore lint/complexity/noUselessConstructor: fixture for AST-based inject() extraction tests
  constructor(
    _a = inject(ExportedService),
    _b = inject(AliasedService),
    _c = inject(LocalDep),
    _d = inject(DefaultDep),
  ) {}
}
