import { KVError } from './errors';

export const serialize = (value: unknown): string => {
  if (value === undefined) {
    throw new KVError('cannot serialize undefined');
  }
  return JSON.stringify(value);
};

export const deserialize = <T>(raw: string | null): T | undefined => {
  if (raw === null) return undefined;
  return JSON.parse(raw) as T;
};
