import { HTTPException } from 'hono/http-exception';

import { ZeltContextNotAvailableError } from '../../../../kernel/errors';
import {
  createContextKey,
  getInternal,
  setInternal,
} from '../../../../kernel/internal/context-key';

type FormBody = Record<string, string | File | (string | File)[]>;

type ParsedBody =
  | { type: 'json'; val: unknown }
  | { type: 'form'; val: FormBody }
  | { type: 'text'; val: string }
  | { type: 'none'; val: undefined };

const BODY_CONTEXT = createContextKey<ParsedBody>('zelt:body');

/** @throws {ZeltContextNotAvailableError} */
export const setBody = (body: ParsedBody): void => {
  setInternal(BODY_CONTEXT, body);
};

/** @throws {ZeltContextNotAvailableError} */
const getBody = (): ParsedBody => {
  const ctx = getInternal(BODY_CONTEXT);
  if (!ctx)
    throw new ZeltContextNotAvailableError({
      primitive: 'body',
      requiredContext: 'entry',
    });
  return ctx;
};

/** @throws {ZeltContextNotAvailableError | HTTPException} */
export function body(type?: 'json'): unknown;
/** @throws {ZeltContextNotAvailableError | HTTPException} */
export function body(type: 'form'): FormBody;
/** @throws {ZeltContextNotAvailableError | HTTPException} */
export function body(type: 'text'): string;
/** @throws {ZeltContextNotAvailableError | HTTPException} */
export function body(type: 'json' | 'form' | 'text' = 'json'): unknown {
  const parsedBody = getBody();

  if (parsedBody.type !== type) {
    throw new HTTPException(415, {
      message: `Expected ${type} body, got ${parsedBody.type}`,
    });
  }

  return parsedBody.val;
}
