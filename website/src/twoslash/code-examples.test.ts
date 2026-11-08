import { describe, expect, it } from 'bun:test';
import { disablesTypeChecking } from './code-examples.lib';
import { extractTypeScriptExamples } from './documentation-parser.lib';
import { twoslasher } from './twoslasher';

describe('TypeScript documentation examples', () => {
  it('respects Markdown fence nesting and supported fence forms', async () => {
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
    expect(await extractTypeScriptExamples(markdown)).toEqual([
      { code: 'const one: string = "one";', meta: 'title="real"', language: 'ts' },
      { code: 'const two = <div />;', meta: '', language: 'tsx' },
      { code: 'const three = 3;', meta: '', language: 'ts' },
    ]);
  });
  it('uses the site heading and frontmatter syntax before parsing MDX', async () => {
    const markdown =
      '---\ntitle: "{#not-an-expression}"\n---\n## Example {#example}\n```ts\nconst value = 1;\n```';
    expect(await extractTypeScriptExamples(markdown)).toEqual([
      { code: 'const value = 1;', meta: '', language: 'ts' },
    ]);
  });
  it('extracts code immediately inside nested MDX components', async () => {
    const markdown =
      '<Tabs>\n<TabItem value="one">\n```ts\nconst invalid: string = 1;\n```\n</TabItem>\n</Tabs>';
    const examples = await extractTypeScriptExamples(markdown);
    expect(examples).toHaveLength(1);
    const example = examples[0];
    if (!example) throw new Error('Missing MDX example');
    expect(() => twoslasher(example.code, example.language)).toThrow('2322');
  });
  it.each(['md', 'detect'])('checks TypeScript in Markdown format %s', async (format) => {
    const markdown = `---\nmdx:\n  format: ${format}\n---\nAn unclosed <T> is valid Markdown.\n\n\`\`\`ts\nconst invalid: string = 1;\n\`\`\``;
    const examples = await extractTypeScriptExamples(markdown, 'guide.md');
    expect(examples).toHaveLength(1);
    const example = examples[0];
    if (!example) throw new Error('Missing Markdown example');
    expect(() => twoslasher(example.code, example.language)).toThrow('2322');
  });
  it('retains MDX parsing for explicit, detected and default MDX', async () => {
    for (const header of [
      '',
      '---\nmdx:\n  format: mdx\n---\n',
      '---\nmdx:\n  format: detect\n---\n',
    ]) {
      await expect(
        extractTypeScriptExamples(`${header}An unclosed <T>`, 'guide.mdx'),
      ).rejects.toThrow();
    }
  });
  it('detects directives after interpolated templates using real virtual file boundaries', () => {
    const code = `const template = \`value \${1} tail\`;\n// @filename: virtual.ts\n// @ts-nocheck\nconst invalid: string = 1;`;
    expect(disablesTypeChecking({ code, meta: '', language: 'ts' })).toBe(true);
    expect(twoslasher(code, 'ts').meta.virtualFiles).toHaveLength(2);
  });
  it('keeps inline filename comments in their original file', () => {
    const code =
      'const original = 1; // @filename: not-a-file.ts\n// @ts-nocheck\nconst invalid: string = 1;';
    expect(disablesTypeChecking({ code, meta: '', language: 'ts' })).toBe(false);
    expect(() => twoslasher(code, 'ts')).toThrow('2322');
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
