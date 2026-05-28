import { createMethodDecorator } from '@zeltjs/decorator-metadata';

import { ZeltDecoratorUsageError } from '../../../../kernel/errors';
import type { RequestContextSchema } from '../../request/injection';

type Roles = RequestContextSchema['authRoles'];

/** @throws {E} */
export const Authorized = (roles: Roles = []) =>
  createMethodDecorator({ decorator: 'Authorized' as const, roles } as const, {
    rejectStatic: () =>
      new ZeltDecoratorUsageError({ decoratorName: 'Authorized', reason: 'static_method' }),
  });
