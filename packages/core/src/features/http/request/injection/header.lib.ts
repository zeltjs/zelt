import { requestContext } from '../index';

/** @throws {ZeltContextNotAvailableError} */
export const header = (name: string): string | undefined => {
  return requestContext().req.header(name);
};
