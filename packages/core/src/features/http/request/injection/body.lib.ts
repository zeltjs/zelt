import type { Context } from 'hono';

import {
  createContextKey,
  getInternal,
  setInternal,
  ZeltContextNotAvailableError,
} from '../../../../kernel';
import { BadRequestException, UnsupportedMediaTypeException } from '../../http.exceptions';

type FormBody = Record<string, string | File | (string | File)[]>;

export type ParsedBody =
  | { raw?: string; type: 'json'; val: unknown }
  | { raw?: string; type: 'form'; val: FormBody }
  | { raw?: string; type: 'text'; val: string }
  | { raw?: string; type: 'none'; val: undefined };

const BODY_CONTEXT = createContextKey<ParsedBody>('zelt:body');

/** @throws {ZeltContextNotAvailableError} */
export const setBody = (body: ParsedBody): void => {
  setInternal(BODY_CONTEXT, body);
};

// Lets injection middlewares at different router levels avoid re-reading the
// request stream: only the first injection per request parses the body.
/** @throws {ZeltContextNotAvailableError} */
export const hasParsedBody = (): boolean => getInternal(BODY_CONTEXT) !== undefined;

/** @throws {BadRequestException} */
const parseJsonBody = async (c: Pick<Context, 'req'>): Promise<ParsedBody> => {
  const raw = await c.req.text().catch((e: Error) => {
    throw new BadRequestException({ reason: `Invalid JSON: ${e.message}` });
  });
  let val: unknown;
  try {
    val = JSON.parse(raw);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new BadRequestException({ reason: `Invalid JSON: ${message}` });
  }
  return { raw, type: 'json', val };
};

/** @throws {BadRequestException} */
const parseFormBody = async (c: Pick<Context, 'req'>): Promise<ParsedBody> => {
  const raw = await c.req.raw
    .clone()
    .text()
    .catch((e: Error) => {
      throw new BadRequestException({ reason: `Invalid form data: ${e.message}` });
    });
  const val: FormBody = await c.req.parseBody({ all: true }).catch((e: Error) => {
    throw new BadRequestException({ reason: `Invalid form data: ${e.message}` });
  });
  return { raw, type: 'form', val };
};

/** @throws {BadRequestException} */
const parseTextBody = async (c: Pick<Context, 'req'>): Promise<ParsedBody> => {
  const raw = await c.req.text().catch((e: Error) => {
    throw new BadRequestException({ reason: `Invalid text body: ${e.message}` });
  });
  return { raw, type: 'text', val: raw };
};

/** @throws {BadRequestException} */
export const parseRequestBody = async (c: Pick<Context, 'req'>): Promise<ParsedBody> => {
  const contentType = c.req.header('content-type') ?? '';

  if (contentType.includes('application/json')) {
    return parseJsonBody(c);
  }

  if (
    contentType.includes('multipart/form-data') ||
    contentType.includes('application/x-www-form-urlencoded')
  ) {
    return parseFormBody(c);
  }

  if (contentType.startsWith('text/')) {
    return parseTextBody(c);
  }

  return { type: 'none', val: undefined };
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

/** @throws {ZeltContextNotAvailableError} */
export const bodyRaw = (): string | undefined => {
  return getBody().raw;
};

/** @throws {ZeltContextNotAvailableError | UnsupportedMediaTypeException} */
export function body(type?: 'json'): unknown;
/** @throws {ZeltContextNotAvailableError | UnsupportedMediaTypeException} */
export function body(type: 'form'): FormBody;
/** @throws {ZeltContextNotAvailableError | UnsupportedMediaTypeException} */
export function body(type: 'text'): string;
/** @throws {ZeltContextNotAvailableError | UnsupportedMediaTypeException} */
export function body(type: 'json' | 'form' | 'text' = 'json'): unknown {
  const parsedBody = getBody();

  if (parsedBody.type !== type) {
    throw new UnsupportedMediaTypeException({ expected: type, actual: parsedBody.type });
  }

  return parsedBody.val;
}
