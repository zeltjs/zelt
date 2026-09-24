export const relationIdOf = (ownerId: string, to: string, kind: string): string =>
  `relation:${JSON.stringify([ownerId, to, kind])}`;

export const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Stable JSON: object keys sorted, so the same facts always hash the same. */
export const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => compare(a, b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
};
