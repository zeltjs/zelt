export const unsafeTypedJsonParse = <T>(data: string): T => JSON.parse(data) as T;
