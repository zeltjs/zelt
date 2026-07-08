import { createClassDecorator } from '../../../index';

const Service = createClassDecorator({ type: 'service' });
const inject = <T>(_cls: new (...args: never[]) => T): T => {
  return {} as T;
};

export class PlainDependency {}

@Service
export class PlainDepService {
  // biome-ignore lint/complexity/noUselessConstructor: fixture for AST-based inject() extraction tests
  constructor(_dep = inject(PlainDependency)) {}
}
