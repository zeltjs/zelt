import { describe, expect, it } from 'vitest';
import { twoslashBlocks, visibleCode } from '../src/twoslash/code-blocks.lib';
import { graphqlDrizzleSetup } from '../src/twoslash/graphql-drizzle-setup.lib';
import { createTwoslasherForPage } from '../src/twoslash/twoslasher';
import { virtualFiles } from './guide-project.lib';
import { createReadCodeBlocks } from './markdown-code.lib';

const readCodeBlocks = createReadCodeBlocks();

const values = async (markdown: string, file = 'page.md') =>
  (await readCodeBlocks(file, markdown)).map(({ lang, value }) => ({ lang, value }));

describe('readCodeBlocks', () => {
  it('reads fences inside block quotes and list items', async () => {
    const markdown = [
      '> ```ts',
      '> const quoted = 1;',
      '> ```',
      '',
      '- item',
      '',
      '  ```ts',
      '  const listed = 1;',
      '  ```',
      '',
    ].join('\n');
    expect(await values(markdown)).toEqual([
      { lang: 'ts', value: 'const quoted = 1;' },
      { lang: 'ts', value: 'const listed = 1;' },
    ]);
  });

  it('closes a fence followed by ASCII spaces and tabs, but not by shorter or other fences', async () => {
    const markdown = [
      '````ts',
      'const doc = `',
      '```ts',
      '```',
      '`;',
      '```` \t',
      '~~~ts',
      'const tilde = 1;',
      '```',
      '~~~~',
      '',
    ].join('\n');
    expect(await values(markdown)).toEqual([
      { lang: 'ts', value: 'const doc = `\n```ts\n```\n`;' },
      { lang: 'ts', value: 'const tilde = 1;\n```' },
    ]);
  });

  it('parses .md pages as MDX, as the site does, with heading IDs and front matter', async () => {
    const markdown = [
      '---',
      'sidebar_label: Page',
      '---',
      '',
      '## Title {#title}',
      '',
      '    const indented = 1;',
      '',
      '```ts',
      'const fenced = 1;',
      '```',
      '',
    ].join('\n');
    // MDX has no indented code blocks.
    expect(await values(markdown)).toEqual([{ lang: 'ts', value: 'const fenced = 1;' }]);
  });

  it('follows a page that asks for plain Markdown in its front matter', async () => {
    const markdown = ['---', 'mdx:', '  format: md', '---', '', '    const indented = 1;', ''].join(
      '\n',
    );
    expect(await values(markdown)).toEqual([{ lang: null, value: 'const indented = 1;' }]);
  });

  it('sees the code nodes the Twoslash renderer sees after the plugins before it', async () => {
    const markdown = [
      ':::note',
      '',
      '```ts',
      'const admonished = 1;',
      '```',
      '',
      ':::',
      '',
      '```mermaid',
      'graph TD; A-->B;',
      '```',
      '',
    ].join('\n');
    // The mermaid plugin turns its blocks into components before the renderer runs.
    expect(await values(markdown)).toEqual([{ lang: 'ts', value: 'const admonished = 1;' }]);
  });

  it('reads CRLF documents', async () => {
    expect(await values('```ts\r\na;\r\nb;\r\n```\r\n')).toEqual([
      { lang: 'ts', value: 'a;\r\nb;' },
    ]);
  });
});

describe('twoslashBlocks', () => {
  it('selects TypeScript fences by alias and skips example excerpts', async () => {
    const markdown = [
      '```ts twoslash',
      'a;',
      '```',
      '```typescript',
      'b;',
      '```',
      '```tsx',
      'c;',
      '```',
      '```typescriptreact',
      'd;',
      '```',
      '```ts source=examples/hello/src/app.ts',
      'e;',
      '```',
      '```js',
      'f;',
      '```',
      '',
    ].join('\n');
    expect(twoslashBlocks(await readCodeBlocks('page.md', markdown))).toEqual([
      { lang: 'typescript', code: 'a;' },
      { lang: 'typescript', code: 'b;' },
      { lang: 'tsx', code: 'c;' },
      { lang: 'tsx', code: 'd;' },
    ]);
  });
});

describe('visibleCode', () => {
  it('hides the lines before a cut marker that stands on its own line, in LF and CRLF', () => {
    expect(visibleCode('hidden;\n// ---cut---\nshown;\n')).toBe('shown;\n');
    expect(visibleCode('hidden;\r\n// ---cut---\r\nshown;\r\n')).toBe('shown;\r\n');
  });

  it('does not treat a marker inside a line as a cut', () => {
    const code = "const marker = '// ---cut---';\nshown;\n";
    expect(visibleCode(code)).toBe(code);
  });

  it('applies the other Twoslash cut markers', () => {
    expect(
      visibleCode('a;\n// ---cut-start---\nb;\n// ---cut-end---\nc;\n// ---cut-after---\nd;\n'),
    ).toBe('a;\nc;\n');
  });
});

describe('virtualFiles', () => {
  it('splits at @filename lines in CRLF blocks', () => {
    expect(
      virtualFiles('// @filename: a.ts\r\nexport const a = 1;\r\n// @filename: b.ts\r\nb;\r\n'),
    ).toEqual([
      { name: 'a.ts', content: 'export const a = 1;\r\n' },
      { name: 'b.ts', content: 'b;\r\n' },
    ]);
  });
});

describe('graphqlDrizzleSetup', () => {
  it('shows only the code after the cut marker in CRLF documents', () => {
    const block = (path: string) => ({
      lang: 'typescript' as const,
      code: `// @filename: hidden.ts\r\n// ---cut---\r\n// ${path}\r\nexport {};\r\n`,
    });
    const page = [
      'src/db/schema.ts',
      'src/generated/drizzle-graphql.ts',
      'src/graphql/user.resolver.ts',
      'src/graphql/post.resolver.ts',
      'src/app.ts',
    ].map(block);
    expect(graphqlDrizzleSetup(page, '')['graphql-drizzle/src/db/schema.ts']).toBe(
      '// src/db/schema.ts\r\nexport {};\r\n',
    );
  });
});

describe('Twoslash snippet isolation', () => {
  const diagnostics = (run: () => unknown): string => {
    try {
      run();
      return 'ok';
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  };
  // A failing snippet leaves its files behind in a shared Twoslash VFS, and a passing one
  // leaves them as empty files; neither may change what a later snippet sees.
  const failing = `// @filename: leaked.ts
export const leaked = 1;
// @filename: index.ts
const broken: string = 1;`;
  const passing = `// @filename: helper.ts
export const helper = 1;
// @filename: index.ts
export {};`;
  const reader = `import { leaked } from './leaked';
import { helper } from './helper';
export const value = [leaked, helper];`;

  it('gives every snippet the same diagnostics whatever ran before it', () => {
    const twoslasherFor = createTwoslasherForPage();
    const alone = diagnostics(() => twoslasherFor([])(reader, 'ts'));
    expect(alone).toMatch(/Cannot find module '\.\/leaked'/);
    expect(alone).toMatch(/Cannot find module '\.\/helper'/);
    const twoslasher = twoslasherFor([]);
    expect(diagnostics(() => twoslasher(failing, 'ts'))).not.toBe('ok');
    expect(diagnostics(() => twoslasher(passing, 'ts'))).toBe('ok');
    expect(diagnostics(() => twoslasher(reader, 'ts'))).toBe(alone);
  }, 60_000);
});
