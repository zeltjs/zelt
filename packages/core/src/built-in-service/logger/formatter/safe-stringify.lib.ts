export const safeStringify = (value: unknown): string => {
  const seen = new WeakSet<WeakKey>();
  return JSON.stringify(value, (_key, val: unknown) => {
    if (typeof val === 'bigint') return val.toString();
    if (typeof val === 'object' && val !== null) {
      if (seen.has(val)) return '[Circular]';
      seen.add(val);
    }
    return val;
  });
};
