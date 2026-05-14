import { ZeltDecoratorUsageError } from '../../errors';
import { resolveMethodArgs } from '../../internal/decorator-context';
import { appendPendingAuthorizedMetadata } from '../internal/metadata';
import type { RequestContextSchema } from '../primitives/get-context';

type Roles = RequestContextSchema['authRoles'];

/** @throws {ZeltDecoratorUsageError | ZeltLifecycleStateError} */
export const Authorized =
  (roles: Roles = []) =>
  (...args: unknown[]): void => {
    const { pendingKey, methodName, isStatic } = resolveMethodArgs(args);
    if (isStatic) {
      throw new ZeltDecoratorUsageError({ decoratorName: 'Authorized', reason: 'static_method' });
    }
    appendPendingAuthorizedMetadata(pendingKey, methodName, roles);
  };
