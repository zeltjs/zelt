import { LeafService } from './leaf.service';

const inject = <T>(_cls: new (...args: never[]) => T): T => {
  return {} as T;
};

export class PlainService {
  // biome-ignore lint/complexity/noUselessConstructor: fixture for AST-based inject() extraction tests
  constructor(_leaf = inject(LeafService)) {}
}
