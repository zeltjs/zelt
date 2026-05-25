import { createClassDecorator } from '../../../index';

const Config = createClassDecorator({ decorator: 'Config' });
const Service = createClassDecorator({ type: 'service' });
const inject = <T>(_cls: new (...args: never[]) => T): T => {
  return {} as T;
};

@Config
export class TestConfig {
  get value(): string {
    return 'test';
  }
}

@Service
export class ServiceWithConfig {
  // biome-ignore lint/complexity/noUselessConstructor: fixture for AST-based inject() extraction tests
  constructor(_config = inject(TestConfig)) {}
}
