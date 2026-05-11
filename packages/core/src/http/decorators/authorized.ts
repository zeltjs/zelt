import { resolveMethodArgs } from '../../internal/decorator-context';
import { appendPendingAuthorizedMetadata } from '../internal/metadata';
import type { RequestContextSchema } from '../primitives/get-context';

type Roles = RequestContextSchema['authRoles'];

export const Authorized =
  (roles: Roles = []) =>
  (...args: unknown[]): void => {
    const { pendingKey, methodName, isStatic } = resolveMethodArgs(args);
    if (isStatic) {
      throw new Error('zelt: @Authorized cannot be applied to static methods');
    }
    appendPendingAuthorizedMetadata(pendingKey, methodName, roles);
  };
