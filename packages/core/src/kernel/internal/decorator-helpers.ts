import { injectable } from '@needle-di/core';
import type { ClassDecoratorFn } from '@zeltjs/decorator-metadata';
import { createClassDecorator } from '@zeltjs/decorator-metadata';
import { match } from 'ts-pattern';

import { ZeltDecoratorUsageError } from '../errors';

type AnyClass = new (...args: never[]) => unknown;

export type InjectableClassDecoratorHooks = {
  readonly afterApply?: (cls: AnyClass) => void;
};

export type CreateInjectableClassDecoratorOptions = {
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

/** @throws {E} */
export const createInjectableClassDecorator = <TProps extends { decorator: string }>(
  props: TProps,
  hooks?: InjectableClassDecoratorHooks,
  options?: CreateInjectableClassDecoratorOptions,
): ClassDecoratorFn =>
  createClassDecorator<TProps, ZeltDecoratorUsageError>(props, {
    ...(options?.unique ? { rejectIfApplied: buildUniqueGuard(props.decorator) } : {}),
    afterApply: (cls) => {
      hooks?.afterApply?.(cls);
      injectable()(cls);
    },
  });
