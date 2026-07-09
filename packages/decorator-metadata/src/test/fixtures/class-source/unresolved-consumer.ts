import { createClassDecorator } from '../../../index';

const Service = createClassDecorator({ type: 'service' });
const inject = <T>(_cls: new (...args: never[]) => T): T => {
  return {} as T;
};

@Service
class NeverExported {}

@Service
export class UnresolvedConsumer {
  // biome-ignore lint/complexity/noUselessConstructor: fixture for AST-based inject() extraction tests
  constructor(_a = inject(NeverExported)) {}
}
