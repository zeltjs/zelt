import { injectable } from '@needle-di/core';
import type { ClassDecoratorFn, Position } from '@zeltjs/decorator-metadata';
import { defineClassDecorator } from '@zeltjs/decorator-metadata';
import { match } from 'ts-pattern';

import { ZeltDecoratorUsageError } from '../errors';

type InjectableClass = new (...args: never[]) => object;

const toInjectableClass = (value: unknown): InjectableClass | undefined =>
  typeof value === 'function' ? (value as unknown as InjectableClass) : undefined;

export type InjectableClassDecoratorHooks = {
  readonly afterApply?: (cls: InjectableClass) => void;
};

export type DefineInjectableClassDecoratorOptions = {
  /**
   * When true, applying the same-named decorator (matched by props.decorator)
   * more than once to the same class throws ZeltDecoratorUsageError.
   */
  readonly unique?: boolean;
};

const buildUniqueGuard =
  (decoratorName: string) =>
  (existing: readonly object[]): ZeltDecoratorUsageError | undefined => {
    const conflict = existing.some((p) =>
      match(p)
        .with({ decorator: decoratorName }, () => true)
        .otherwise(() => false),
    );
    return conflict
      ? new ZeltDecoratorUsageError({ decoratorName, reason: 'duplicate' })
      : undefined;
  };

/** @throws {ZeltDecoratorUsageError} */
export const defineInjectableClassDecorator = <TProps extends { decorator: string }>(
  pos: Position | undefined,
  props: TProps,
  hooks?: InjectableClassDecoratorHooks,
  options?: DefineInjectableClassDecoratorOptions,
): ClassDecoratorFn => {
  const base = defineClassDecorator<TProps, ZeltDecoratorUsageError>(
    pos,
    props,
    options?.unique ? { rejectIfApplied: buildUniqueGuard(props.decorator) } : undefined,
  );

  function decorate<T extends abstract new (...args: never[]) => unknown>(
    value: T,
    context: ClassDecoratorContext,
  ): void;
  function decorate<T extends new (...args: never[]) => unknown>(target: T): T | void;
  function decorate(...args: unknown[]): unknown {
    const target = args[0];
    const context = args[1];
    const baseFn = base as unknown as (...args: unknown[]) => unknown;
    const ret = context === undefined ? baseFn(target) : baseFn(target, context);
    const cls = toInjectableClass(target);
    if (cls) {
      hooks?.afterApply?.(cls);
      injectable()(cls);
    }
    return ret;
  }
  return decorate;
};
