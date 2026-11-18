import { describe, expect, it } from 'vitest';
import { codeFences } from '../src/twoslash/code-fences.lib';
import { graphqlDrizzleSetup } from '../src/twoslash/graphql-drizzle-setup.lib';

describe('codeFences', () => {
  it('closes a block only on a fence of the same character and at least the opening length', () => {
    const markdown = [
      '````ts',
      'const doc = `',
      '```ts',
      'inner',
      '```',
      '`;',
      '````',
      '~~~ts',
      'const tilde = 1;',
      '```',
      '~~~~',
      '```bash',
      'echo ```',
      '```',
      '',
    ].join('\n');
    expect(codeFences(markdown, 'ts')).toEqual([
      'const doc = `\n```ts\ninner\n```\n`;\n',
      'const tilde = 1;\n```\n',
    ]);
  });

  it('treats a line indented by four or more spaces as content, not a fence', () => {
    const markdown = ['```ts', 'const doc = `', '    ```', '`;', '   ```', ''].join('\n');
    expect(codeFences(markdown, 'ts')).toEqual(['const doc = `\n    ```\n`;\n']);
  });

  it('takes the language from the first word of the info string', () => {
    const markdown = '```ts twoslash\na;\n```\n```tsx\nb;\n```\n';
    expect(codeFences(markdown, 'ts')).toEqual(['a;\n']);
  });

  it('reads CRLF documents', () => {
    expect(codeFences('```ts\r\na;\r\n```\r\n', 'ts')).toEqual(['a;\r\n']);
  });
});

describe('graphqlDrizzleSetup', () => {
  it('shows only the code after the cut marker in CRLF documents', () => {
    const block = (path: string) =>
      `\`\`\`ts\r\n// @filename: hidden.ts\r\n// ---cut---\r\n// ${path}\r\nexport {};\r\n\`\`\`\r\n`;
    const markdown = [
      'src/db/schema.ts',
      'src/generated/drizzle-graphql.ts',
      'src/graphql/user.resolver.ts',
      'src/graphql/post.resolver.ts',
      'src/app.ts',
    ]
      .map(block)
      .join('');
    expect(graphqlDrizzleSetup(markdown, '')['graphql-drizzle/src/db/schema.ts']).toBe(
      '// src/db/schema.ts\r\nexport {};\r\n',
    );
  });
});
