import { requestContext } from '..';

/** @throws {ZeltContextNotAvailableError} */
export const queryParam = (name: string): string | undefined => {
  return requestContext().req.query(name);
};

/** @throws {ZeltContextNotAvailableError} */
export const queryParams = (name: string): string[] => {
  return requestContext().req.queries(name) ?? [];
};
