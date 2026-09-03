import { createMethodDecorator } from '@zeltjs/decorator-metadata';

import { ZeltDecoratorUsageError } from '../../../../kernel';
import type { AuthRoles } from './auth.lib';

/** @throws {E} */
export const Authorized = (roles: AuthRoles = []) =>
  createMethodDecorator({ decorator: 'Authorized' as const, roles } as const, {
    rejectStatic: () =>
      new ZeltDecoratorUsageError({ decoratorName: 'Authorized', reason: 'static_method' }),
  });
