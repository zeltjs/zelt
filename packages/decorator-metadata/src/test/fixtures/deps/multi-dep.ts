import { createClassDecorator } from '../../../index';

const Service = createClassDecorator({ type: 'service' });
const inject = <T>(_cls: new (...args: never[]) => T): T => {
  return {} as T;
};

@Service
export class DepA {}

@Service
export class DepB {}

@Service
export class DepC {}

@Service
export class MultiDepService {
  // biome-ignore lint/complexity/noUselessConstructor: fixture for AST-based inject() extraction tests
  constructor(_a = inject(DepA), _b = inject(DepB), _c = inject(DepC)) {}
}
