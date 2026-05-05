import { setAuthorizedMetadata } from '../internal/metadata';
import type { RequestContextSchema } from '../primitives/get-context';

type Roles = RequestContextSchema['authRoles'];

export const Authorized =
  (roles: Roles = []) =>
  (target: object, propertyKey: string | symbol): void => {
    if (typeof target === 'function') {
      throw new Error('zelt: @Authorized cannot be applied to static methods');
    }
    setAuthorizedMetadata(target.constructor, propertyKey, roles);
  };
