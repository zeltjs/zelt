import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { remarkTwoslashBlock } from '../src/remark/remark-twoslash-block';
import { twoslasherFor } from '../src/twoslash/twoslasher';

type Node =
  | { type: 'code'; lang: string; value: string }
  | { type: 'twoslashBlock'; data: { hProperties: { dataPlainHtml: string } } };

describe('Twoslash hidden setup', () => {
  it.each(['ts', 'typescript', 'tsx', 'typescriptreact'])(
    'hides virtual files and setup in %s fences',
    async (lang) => {
      const tree: { type: 'root'; children: Node[] } = {
        type: 'root',
        children: [
          {
            type: 'code',
            lang,
            value: `// @filename: support.ts
export const hiddenSetup = 1;
// @filename: index.ts
import { hiddenSetup } from './support';
// ---cut---
export const visibleCode = hiddenSetup;`,
          },
        ],
      };
      await remarkTwoslashBlock({
        twoslasherFor,
        themes: { light: 'kanagawa-wave', dark: 'kanagawa-wave' },
        langs: ['typescript', 'tsx'],
      })(tree, { value: '' });
      const rendered = tree.children[0];
      expect(rendered?.type).toBe('twoslashBlock');
      if (rendered?.type !== 'twoslashBlock')
        throw new Error('TypeScript fence was not rendered by Twoslash');
      const html = Buffer.from(rendered.data.hProperties.dataPlainHtml, 'base64').toString('utf8');
      expect(html).toContain('visibleCode');
      expect(html).not.toMatch(/@filename|---cut---|hiddenSetup = 1|support/);
    },
  );
});
