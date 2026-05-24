import { defineMethodDecorator } from '@zeltjs/decorator-metadata';

import { ZeltDecoratorUsageError } from '../../../kernel/errors';
import { captureStackTraceForCore } from '../../../kernel/internal/decorator-position';
import type { RequestContextSchema } from '../primitives/get-context';

type Roles = RequestContextSchema['authRoles'];

/** @throws {ZeltDecoratorUsageError | ZeltLifecycleStateError} */
export const Authorized = (roles: Roles = []) =>
  defineMethodDecorator(
    captureStackTraceForCore(),
    { decorator: 'Authorized' as const, roles } as const,
    {
      rejectStatic: () =>
        new ZeltDecoratorUsageError({ decoratorName: 'Authorized', reason: 'static_method' }),
    },
  );
