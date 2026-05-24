import { defineMethodDecorator } from '@zeltjs/decorator-metadata';

import { ZeltDecoratorUsageError } from '../../../kernel/errors';
import { captureStackTraceForCore } from '../../../kernel/internal/decorator-position';
import type { HttpMethod } from '../internal/metadata';

/** @throws {ZeltDecoratorUsageError | ZeltLifecycleStateError} */
const makeDecorator = (method: HttpMethod) => (path: string) =>
  defineMethodDecorator(
    captureStackTraceForCore(),
    { decorator: 'Route' as const, method, path } as const,
    {
      rejectStatic: () =>
        new ZeltDecoratorUsageError({ decoratorName: method, reason: 'static_method' }),
    },
  );

export const Get = makeDecorator('GET');
export const Post = makeDecorator('POST');
export const Put = makeDecorator('PUT');
export const Patch = makeDecorator('PATCH');
export const Delete = makeDecorator('DELETE');
