import { HTTPException } from 'hono/http-exception';

import { getEntryContext } from '../entry-context';

type FormBody = Record<string, string | File | (string | File)[]>;

/** @throws {ZeltContextNotAvailableError | HTTPException} */
export function body(type?: 'json'): unknown;
/** @throws {ZeltContextNotAvailableError | HTTPException} */
export function body(type: 'form'): FormBody;
/** @throws {ZeltContextNotAvailableError | HTTPException} */
export function body(type: 'text'): string;
/** @throws {ZeltContextNotAvailableError | HTTPException} */
export function body(type: 'json' | 'form' | 'text' = 'json'): unknown {
  const { body: parsedBody } = getEntryContext().input;

  if (parsedBody.type !== type) {
    throw new HTTPException(415, {
      message: `Expected ${type} body, got ${parsedBody.type}`,
    });
  }

  return parsedBody.val;
}
