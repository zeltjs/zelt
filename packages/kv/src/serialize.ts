import type { Defined } from './types';

export const serialize = (value: Defined): string => JSON.stringify(value);

// deserialize stays sync without Result because we control the input (always
// a string we previously serialized via JSON.stringify, plus driver-controlled null sentinel).
export const deserialize = <T>(raw: string | null): T | undefined => {
  if (raw === null) return undefined;
  return JSON.parse(raw) as T;
};
