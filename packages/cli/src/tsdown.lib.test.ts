import { describe, expect, it } from 'vitest';

import { buildTsdownCommand, quoteShellArg } from './tsdown.lib';

describe('quoteShellArg', () => {
  it('keeps simple values unquoted', () => {
    expect(quoteShellArg('./src/main.ts')).toBe('./src/main.ts');
  });

  it('uses double quotes for shell values that need quoting', () => {
    expect(quoteShellArg("./src/main file's.ts")).toBe('"./src/main file\'s.ts"');
  });
});

describe('buildTsdownCommand', () => {
  it('builds the default tsdown command with shell-safe arguments', () => {
    expect(buildTsdownCommand({ entry: "./src/main file's.ts", outDir: './dist app' })).toContain(
      `--entry "./src/main file's.ts" --out-dir "./dist app"`,
    );
  });
});
