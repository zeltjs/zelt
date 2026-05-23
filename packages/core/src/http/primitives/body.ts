import { getEntryContext } from '../internal/entry-context';

type FormBody = Record<string, string | File | (string | File)[]>;

/** @throws {ZeltContextNotAvailableError} */
export function body(type?: 'json'): unknown;
/** @throws {ZeltContextNotAvailableError} */
export function body(type: 'form'): FormBody | undefined;
/** @throws {ZeltContextNotAvailableError} */
export function body(type: 'json' | 'form' = 'json'): unknown {
  const input = getEntryContext().input;
  return type === 'json' ? input.jsonBody : input.formBody;
}
