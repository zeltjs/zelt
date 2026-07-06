import { createClassDecorator } from '../../../index';
import * as ns from './ns-decorators';

const Service = createClassDecorator({ type: 'service' });
const inject = <T>(_cls: new (...args: never[]) => T): T => {
  return {} as T;
};

@ns.Controller('/x')
export class NamespaceDecoratedDependency {}

@Service
export class NamespaceDepConsumer {
  // biome-ignore lint/complexity/noUselessConstructor: fixture for AST-based inject() extraction tests
  constructor(_dep = inject(NamespaceDecoratedDependency)) {}
}
