import { ZeltRouteConfigurationError } from '../../../kernel/errors';
import { getEntryContext } from '../internal/entry-context';

/**
 * @throws {ZeltContextNotAvailableError}
 * @throws {ZeltRouteConfigurationError}
 */
export const pathParam = (name: string): string => {
  const value = getEntryContext().input.pathParams[name];
  if (value === undefined) {
    throw new ZeltRouteConfigurationError({ reason: 'missing_path_param', paramName: name });
  }
  return value;
};
