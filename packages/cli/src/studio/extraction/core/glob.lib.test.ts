import { describe, expect, it } from 'vitest';

import { compileGlobs, matchesGlob } from './glob.lib';

describe('matchesGlob', () => {
  it('matches a file under a recursive directory glob', () => {
    expect(
      matchesGlob('integration/ec-backend/src/**/*.ts', 'integration/ec-backend/src/app.ts'),
    ).toBe(true);
    expect(
      matchesGlob('integration/ec-backend/src/**/*.ts', 'integration/ec-backend/src/entry/a/b.ts'),
    ).toBe(true);
  });

  it('does not let * cross a path separator', () => {
    expect(matchesGlob('src/*.ts', 'src/nested/a.ts')).toBe(false);
  });

  it('matches dotfiles (dot = true)', () => {
    expect(matchesGlob('**/*.ts', '.hidden/a.ts')).toBe(true);
  });

  it('is case sensitive', () => {
    expect(matchesGlob('src/App.ts', 'src/app.ts')).toBe(false);
  });

  it('matches a trailing ** against everything below the prefix', () => {
    expect(matchesGlob('packages/**', 'packages/core/src/index.ts')).toBe(true);
    expect(matchesGlob('packages/**', 'integration/x.ts')).toBe(false);
  });

  it('matches a middle ** against zero directories', () => {
    expect(matchesGlob('a/**/b.ts', 'a/b.ts')).toBe(true);
    expect(matchesGlob('a/**/b.ts', 'a/x/y/b.ts')).toBe(true);
  });

  it('treats glob metacharacters in the literal part as literals', () => {
    expect(matchesGlob('a.b/c.ts', 'axb/c.ts')).toBe(false);
  });
});

describe('compileGlobs', () => {
  it('matches when any pattern matches', () => {
    const match = compileGlobs(['**/*.test.ts', '**/dist/**']);
    expect(match('src/a.test.ts')).toBe(true);
    expect(match('pkg/dist/a.js')).toBe(true);
    expect(match('src/a.ts')).toBe(false);
  });

  it('never matches when there is no pattern', () => {
    expect(compileGlobs([])('src/a.ts')).toBe(false);
  });
});
