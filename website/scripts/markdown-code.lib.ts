import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Options as MdxLoaderOptions } from '@docusaurus/mdx-loader';
import mdxLoader from '@docusaurus/mdx-loader';
import type { MarkdownConfig } from '@docusaurus/types';
import type { Root } from 'mdast';
import { visit } from 'unist-util-visit';
import config from '../docusaurus.config';
import { twoslashContent } from '../src/markdown-content';
import { remarkTwoslashBlock } from '../src/remark/remark-twoslash-block';
import type { CodeBlock } from '../src/twoslash/code-blocks.lib';

const siteDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** @throws {Error} The site config leaves a parsing setting to a Docusaurus default. */
const explicit = <T>(value: T | undefined, setting: string): T => {
  if (value === undefined)
    throw new Error(`docusaurus.config.ts must set markdown.${setting}; the doc scripts read it.`);
  return value;
};

const markdown = config.markdown ?? {};
const mdx1Compat = markdown.mdx1Compat ?? {};

// The site's own settings. Docusaurus fills in the ones it leaves unset; those that change how a
// page parses must be set in the config, and the rest only shape headings, text and links.
const markdownConfig: MarkdownConfig = {
  format: explicit(markdown.format, 'format'),
  mdx1Compat: {
    comments: explicit(mdx1Compat.comments, 'mdx1Compat.comments'),
    admonitions: explicit(mdx1Compat.admonitions, 'mdx1Compat.admonitions'),
    headingIds: explicit(mdx1Compat.headingIds, 'mdx1Compat.headingIds'),
  },
  parseFrontMatter:
    markdown.parseFrontMatter ??
    (({ defaultParseFrontMatter, ...params }) => defaultParseFrontMatter(params)),
  preprocessor: markdown.preprocessor,
  mermaid: markdown.mermaid ?? false,
  emoji: markdown.emoji ?? true,
  anchors: { maintainCase: markdown.anchors?.maintainCase ?? false },
  // remark-rehype runs after the code nodes are read.
  remarkRehypeOptions: undefined,
  hooks: {
    onBrokenMarkdownLinks: markdown.hooks?.onBrokenMarkdownLinks ?? 'warn',
    onBrokenMarkdownImages: markdown.hooks?.onBrokenMarkdownImages ?? 'throw',
  },
};

// The parts of a webpack loader context that Docusaurus' MDX loader reads.
const compile = (
  loaderOptions: MdxLoaderOptions,
  filePath: string,
  fileContent: string,
): Promise<void> =>
  new Promise((resolve, reject) => {
    const context = {
      _compiler: { name: 'client' },
      resource: filePath,
      resourcePath: filePath,
      getOptions: () => loaderOptions,
      addDependency: () => undefined,
      async: () => (error: Error | null) => (error ? reject(error) : resolve()),
    };
    // The loader reads only the members above, not the rest of webpack's LoaderContext.
    void mdxLoader
      .call(context as unknown as ThisParameterType<typeof mdxLoader>, fileContent)
      .catch(reject);
  });

/**
 * Reads the code nodes seen by the site's Twoslash renderer through the Docusaurus MDX loader.
 * @throws {Error} Content that the Docusaurus build cannot compile, or a missing collection step.
 */
export const createReadCodeBlocks = () => {
  const collected = new Map<string, readonly CodeBlock[] | undefined>();

  const collectCodeBlocks = () => (tree: Root, file: { readonly path: string }) => {
    if (!collected.has(file.path))
      throw new Error(`${file.path} was compiled outside readCodeBlocks.`);
    const blocks: CodeBlock[] = [];
    visit(tree, 'code', ({ lang, meta, value }) => {
      blocks.push({ lang, meta, value });
    });
    collected.set(file.path, blocks);
  };

  const remarkPlugins = twoslashContent.remarkPlugins.map(([plugin, options]) =>
    plugin === remarkTwoslashBlock ? collectCodeBlocks : [plugin, options],
  );
  if (!remarkPlugins.includes(collectCodeBlocks))
    throw new Error('docusaurus.config.ts no longer renders code blocks with remarkTwoslashBlock.');

  const loaderOptions: MdxLoaderOptions = {
    ...twoslashContent,
    remarkPlugins,
    // Rendering is not checked here; the code nodes are read before rehype runs.
    rehypePlugins: [],
    markdownConfig,
    siteDir,
    staticDirs: (config.staticDirectories ?? ['static']).flatMap((dir) =>
      dir === undefined ? [] : [path.resolve(siteDir, dir)],
    ),
  };

  return async (filePath: string, fileContent: string): Promise<readonly CodeBlock[]> => {
    const absolute = path.resolve(siteDir, filePath);
    if (collected.has(absolute)) throw new Error(`${absolute} is already being read.`);
    collected.set(absolute, undefined);
    try {
      await compile(loaderOptions, absolute, fileContent);
      const blocks = collected.get(absolute);
      if (blocks === undefined)
        throw new Error(`${absolute}: the code block collector did not run.`);
      return blocks;
    } finally {
      collected.delete(absolute);
    }
  };
};
