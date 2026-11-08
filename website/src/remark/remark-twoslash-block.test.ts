import { describe, expect, it } from 'bun:test';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { twoslasher } from '../twoslash/twoslasher';
import { remarkTwoslashBlock } from './remark-twoslash-block';

const render = remarkTwoslashBlock({
  twoslasher,
  themes: { light: 'github-light', dark: 'github-dark' },
  langs: ['ts'],
});

describe('typed documentation rendering', () => {
  it('renders a checked example', async () => {
    const tree = unified().use(remarkParse).parse('```ts\nconst value: string = "one";\n```');
    await render(tree);
    expect(tree.children[0]).toMatchObject({ type: 'twoslashBlock' });
  });
  it('fails rendering for a type error instead of displaying unchecked code', async () => {
    const tree = unified().use(remarkParse).parse('```ts\nconst value: string = 1;\n```');
    await expect(render(tree)).rejects.toThrow('2322');
  });
  it('rejects a disabling directive during rendering', async () => {
    const tree = unified().use(remarkParse).parse('```ts no-check\nconst value = 1;\n```');
    await expect(render(tree)).rejects.toThrow('must not disable type checking');
  });
});
