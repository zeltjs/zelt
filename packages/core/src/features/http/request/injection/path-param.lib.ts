import {
  createContextKey,
  getInternal,
  setInternal,
  ZeltContextNotAvailableError,
  ZeltRouteConfigurationError,
} from '../../../../kernel';

type PathParams = Readonly<Record<string, string>>;

const PATH_PARAMS_CONTEXT = createContextKey<PathParams>('zelt:path-params');

/** @throws {ZeltContextNotAvailableError} */
export const setPathParams = (params: PathParams): void => {
  setInternal(PATH_PARAMS_CONTEXT, params);
};

/** @throws {ZeltContextNotAvailableError} */
const getPathParams = (): PathParams => {
  const ctx = getInternal(PATH_PARAMS_CONTEXT);
  if (!ctx)
    throw new ZeltContextNotAvailableError({
      primitive: 'pathParam',
      requiredContext: 'entry',
    });
  return ctx;
};

/**
 * @throws {ZeltContextNotAvailableError}
 * @throws {ZeltRouteConfigurationError}
 */
export const pathParam = (name: string): string => {
  const value = getPathParams()[name];
  if (value === undefined) {
    throw new ZeltRouteConfigurationError({ reason: 'missing_path_param', paramName: name });
  }
  return value;
};
