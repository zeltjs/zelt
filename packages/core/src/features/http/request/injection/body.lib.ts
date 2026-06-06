import {
  createContextKey,
  getInternal,
  setInternal,
  ZeltContextNotAvailableError,
} from '../../../../kernel';
import { UnsupportedMediaTypeException } from '../../http.exceptions';

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
