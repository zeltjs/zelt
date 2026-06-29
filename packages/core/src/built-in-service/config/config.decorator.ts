import type { ClassDecoratorFn } from '@zeltjs/decorator-metadata';
import { isClassConstructor } from '@zeltjs/unsafe-type-lib';
import { createInjectableClassDecorator } from '../../kernel';
import { registerConfigClass } from './config-token.lib';

type ConfigOptions = {
  readonly abstract?: boolean;
};

type AbstractClass = abstract new (...args: never[]) => unknown;
type ConcreteClass = new (...args: never[]) => unknown;

/** @throws {E} */
const createConfigDecorator = (options?: ConfigOptions): ClassDecoratorFn =>
  createInjectableClassDecorator(
    options?.abstract === true ? { decorator: 'Config', abstract: true } : { decorator: 'Config' },
    { afterApply: (cls) => registerConfigClass(cls, { abstract: options?.abstract === true }) },
    { unique: true },
  );

const toConfigOptions = (value: unknown): ConfigOptions | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'object' || value === null || isClassConstructor(value)) return undefined;
  return { abstract: Reflect.get(value, 'abstract') === true };
};

export function Config<T extends AbstractClass>(value: T, context: ClassDecoratorContext): void;
export function Config<T extends ConcreteClass>(target: T): T | undefined;
export function Config(options?: ConfigOptions): ClassDecoratorFn;
/** @throws {E} */
export function Config(...args: readonly unknown[]): unknown {
  if (args.length === 0) {
    return createConfigDecorator();
  }

  const value = args[0];
  if (!isClassConstructor(value)) {
    const options = toConfigOptions(value);
    return options === undefined && value !== undefined
      ? undefined
      : createConfigDecorator(options);
  }
  const result: unknown = Reflect.apply(createConfigDecorator(), undefined, args);
  return result;
}
