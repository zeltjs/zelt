import type * as Preset from '@docusaurus/preset-classic';
import rehypeShiki from '@shikijs/rehype';
import { remarkTwoslashBlock } from './remark/remark-twoslash-block';
import { createTwoslasherForPage } from './twoslash/twoslasher';

const shikiBaseConfig = {
  themes: {
    light: 'kanagawa-wave',
    dark: 'kanagawa-wave',
  },
  defaultLanguage: 'text',
  langs: [
    'typescript',
    'javascript',
    'tsx',
    'jsx',
    'bash',
    'json',
    'yaml',
    'css',
    'html',
    'markdown',
    'text',
  ],
};

const twoslashBlockOptions = {
  twoslasherFor: createTwoslasherForPage(),
  themes: shikiBaseConfig.themes,
};

const shikiOptions = {
  ...shikiBaseConfig,
  transformers: [],
};

/** Highlighting without type checking, for pages whose code is checked elsewhere. */
export const shikiRehypePlugins = [[rehypeShiki, shikiOptions]];

/**
 * The Markdown options of docs and pages. scripts/markdown-code.lib.ts runs the same options
 * through Docusaurus' MDX loader, so the doc scripts check the blocks the site renders. This lives
 * outside docusaurus.config.ts because Docusaurus rejects any export there besides the config.
 */
export const twoslashContent = {
  admonitions: true,
  remarkPlugins: [[remarkTwoslashBlock, twoslashBlockOptions]],
  rehypePlugins: shikiRehypePlugins,
} satisfies Preset.Options['docs'];
