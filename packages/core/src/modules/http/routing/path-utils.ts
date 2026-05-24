const stripTrailingSlash = (s: string): string => (s.endsWith('/') ? s.slice(0, -1) : s);

const ensureLeadingSlash = (s: string): string => (s === '' || s.startsWith('/') ? s : `/${s}`);

export const joinPath = (base: string, sub: string): string => {
  const a = stripTrailingSlash(base);
  const b = stripTrailingSlash(ensureLeadingSlash(sub));
  const joined = `${a}${b === '/' ? '' : b}`;
  return joined === '' ? '/' : joined;
};
