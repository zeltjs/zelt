import { describe, expect, it } from 'bun:test';
import { disablesTypeChecking, extractTypeScriptExamples } from './code-examples.lib';

describe('TypeScript documentation examples', () => {
  it('respects Markdown fence nesting and supported fence forms', () => {
    const markdown = [
      '````markdown',
      '```ts title="nested example"',
      'const invalid: string = 1;',
      '```',
      '````',
      '````ts title="real"',
      'const one: string = "one";',
      '````',
      '~~~tsx',
      'const two = <div />;',
      '~~~',
      '```typescript ',
      'const three = 3;',
      '```',
    ].join('\n');
    expect(extractTypeScriptExamples(markdown)).toEqual([
      { code: 'const one: string = "one";', meta: 'title="real"', language: 'ts' },
      { code: 'const two = <div />;', meta: '', language: 'tsx' },
      { code: 'const three = 3;', meta: '', language: 'ts' },
    ]);
  });
  it.each([
    ['const label = "@ts-nocheck";', ''],
    ['/* @ts-nocheck */\nconst value = 1;', ''],
    ['// Show the @ts-nocheck spelling\nconst value = 1;', ''],
    ['const value = 1;\n// @ts-nocheck', ''],
    ['const value = 1;', 'title="no-check example"'],
  ])('accepts text that does not disable checking', (code, meta) => {
    expect(disablesTypeChecking({ code, meta, language: 'ts' })).toBe(false);
  });
  it.each([
    ['// @ts-nocheck\nconst value = 1;', ''],
    ['const first = 1;\n// @filename: second.ts\n// @ts-nocheck\nconst second = 2;', ''],
    ['const value = 1;', 'twoslash no-check title="example"'],
  ])('rejects actual disabling directives and flags', (code, meta) => {
    expect(disablesTypeChecking({ code, meta, language: 'ts' })).toBe(true);
  });
});
