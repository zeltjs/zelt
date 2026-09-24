// picomatch は型定義を同梱せず、本リポジトリは .d.ts の追加を禁じているため、
// 設計書(付録H)が要求する POSIX / case-sensitive / dot=true の部分集合を自前で実装する。

const escapeLiteral = (char: string): string => char.replace(/[.+^${}()|[\]\\]/gu, '\\$&');

const translateSegment = (segment: string): string => {
  let out = '';
  for (const char of segment) {
    if (char === '*') out += '[^/]*';
    else if (char === '?') out += '[^/]';
    else out += escapeLiteral(char);
  }
  return out;
};

const translate = (pattern: string): string => {
  const segments = pattern.split('/');
  const parts: string[] = [];
  for (const [i, segment] of segments.entries()) {
    const last = i === segments.length - 1;
    if (segment === '**') {
      // `a/**/b` は `a/b` にも合う（picomatch と同じ）
      parts.push(last ? '(?:.*)?' : '(?:[^/]+/)*');
      continue;
    }
    parts.push(translateSegment(segment));
    if (!last) parts.push('/');
  }
  return `^${parts.join('')}$`;
};

export type GlobMatcher = (path: string) => boolean;

/** @throws {SyntaxError} on a pattern that cannot be compiled to a RegExp */
export const compileGlob = (pattern: string): GlobMatcher => {
  const regex = new RegExp(translate(pattern), 'u');
  return (path) => regex.test(path);
};

/** @throws {SyntaxError} from compileGlob */
export const compileGlobs = (patterns: readonly string[]): GlobMatcher => {
  const matchers = patterns.map(compileGlob);
  return (path) => matchers.some((match) => match(path));
};

export const matchesGlob = (pattern: string, path: string): boolean => compileGlob(pattern)(path);
