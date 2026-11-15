import type { ReadResult } from './schema.types';

// Drizzle reports invalid schemas through exceptions; the adapter exposes them as values.
export const readDrizzle = <T>(read: () => T): ReadResult<T> => {
  try {
    return { kind: 'success', value: read() };
  } catch (error) {
    return { kind: 'error', message: error instanceof Error ? error.message : String(error) };
  }
};
