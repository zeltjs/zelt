import { requestContext } from '../request-context';

/** @throws {ZeltContextNotAvailableError} */
export const header = (name: string): string | undefined => {
  return requestContext().req.header(name);
};
