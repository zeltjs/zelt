import { ZeltRouteConfigurationError } from '../../../../kernel/errors';
import { getHttpContext } from '../../internal/context-keys';

/**
 * @throws {ZeltContextNotAvailableError}
 * @throws {ZeltRouteConfigurationError}
 */
export const pathParam = (name: string): string => {
  const value = getHttpContext().pathParams[name];
  if (value === undefined) {
    throw new ZeltRouteConfigurationError({ reason: 'missing_path_param', paramName: name });
  }
  return value;
};
