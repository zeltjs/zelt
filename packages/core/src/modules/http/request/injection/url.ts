import { requestContext } from '../request-context';

/** @throws {ZeltContextNotAvailableError} */
export const url = (): string => {
  return requestContext().req.url;
};

/** @throws {ZeltContextNotAvailableError} */
export const path = (): string => {
  return requestContext().req.path;
};

/** @throws {ZeltContextNotAvailableError} */
export const method = (): string => {
  return requestContext().req.method;
};
