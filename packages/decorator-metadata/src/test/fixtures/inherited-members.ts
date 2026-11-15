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
