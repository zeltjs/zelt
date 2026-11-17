import { createClassDecorator, createMethodDecorator, createPropertyDecorator } from '../../index';

export abstract class UndecoratedBase {
  @createPropertyDecorator({ column: true })
  value = '';

  @createMethodDecorator({ method: 'base' })
  ['inherited'](count: number): Promise<string> {
    return Promise.resolve(String(count));
  }
}

@createClassDecorator({ own: true })
export class Derived extends UndecoratedBase {}

export abstract class GenericBase<T> {
  @createPropertyDecorator({ column: true })
  value!: T;

  @createMethodDecorator({ method: 'echo' })
  echo(value: T): T {
    return value;
  }
}

@createClassDecorator({ own: true })
export class StringChild extends GenericBase<string> {}

@createClassDecorator({ own: true })
export class StaticMembers {
  @createPropertyDecorator({ column: true })
  static label = '';

  @createMethodDecorator({ method: 'create' })
  static create(count: number): string {
    return String(count);
  }
}

export abstract class UndecoratedStaticBase {
  @createMethodDecorator({ method: 'make' })
  static make(count: number): string {
    return String(count);
  }
}

@createClassDecorator({ own: true })
export class StaticChild extends UndecoratedStaticBase {}

@createClassDecorator({ own: true })
export class SameNamedMembers {
  @createMethodDecorator({ method: 'run' })
  static run(count: number): number {
    return count;
  }

  run(label: string): string {
    return label;
  }
}
