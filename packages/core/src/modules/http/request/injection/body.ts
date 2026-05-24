import { ZeltBodyTypeMismatchError } from '../../../../kernel/errors';
import { getHttpContext } from '../../internal/context-keys';

type FormBody = Record<string, string | File | (string | File)[]>;

/** @throws {ZeltContextNotAvailableError | ZeltBodyTypeMismatchError} */
export function body(type?: 'json'): unknown;
/** @throws {ZeltContextNotAvailableError | ZeltBodyTypeMismatchError} */
export function body(type: 'form'): FormBody;
/** @throws {ZeltContextNotAvailableError | ZeltBodyTypeMismatchError} */
export function body(type: 'text'): string;
/** @throws {ZeltContextNotAvailableError | ZeltBodyTypeMismatchError} */
export function body(type: 'json' | 'form' | 'text' = 'json'): unknown {
  const { body: parsedBody } = getHttpContext();

  if (parsedBody.type !== type) {
    throw new ZeltBodyTypeMismatchError({
      expected: type,
      actual: parsedBody.type,
    });
  }

  return parsedBody.val;
}
