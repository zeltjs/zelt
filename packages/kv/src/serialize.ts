import { unsafeTypedJsonParse } from '@zeltjs/unsafe-type-lib';

import type { Defined } from './types';

export const serialize = (value: Defined): string => JSON.stringify(value);

export const deserialize = <T>(raw: string | null): T | undefined => {
  if (raw === null) return undefined;
  return unsafeTypedJsonParse<T>(raw);
};
