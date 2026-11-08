import {
  DEFAULT_PARSE_FRONT_MATTER,
  escapeMarkdownHeadingIds,
  parseMarkdownFile,
  unwrapMdxCodeBlocks,
} from '@docusaurus/utils';
import { createProcessor } from '@mdx-js/mdx';
import remarkFrontmatter from 'remark-frontmatter';
import { visit } from 'unist-util-visit';
import type { TypeScriptExample } from './code-examples.lib';

const languages = new Map<string, TypeScriptExample['language']>([
  ['ts', 'ts'],
  ['typescript', 'ts'],
  ['tsx', 'tsx'],
  ['typescriptreact', 'tsx'],
]);

const processors = {
  md: createProcessor({ format: 'md', remarkPlugins: [remarkFrontmatter] }),
  mdx: createProcessor({ format: 'mdx', remarkPlugins: [remarkFrontmatter] }),
};
const markdownExtensions = new Set([
  'md',
  'markdown',
  'mdown',
  'mkdn',
  'mkd',
  'mdwn',
  'mkdown',
  'ron',
]);

/** @throws {Error} */
export const parseDocumentation = async (markdown: string, filePath = 'document.mdx') => {
  const { frontMatter } = await parseMarkdownFile({
    filePath,
    fileContent: markdown,
    parseFrontMatter: DEFAULT_PARSE_FRONT_MATTER,
  });
  const mdx = frontMatter['mdx'];
  const format: unknown =
    typeof mdx === 'object' && mdx !== null && 'format' in mdx ? mdx.format : undefined;
  if (format !== undefined && format !== 'md' && format !== 'mdx' && format !== 'detect')
    throw new Error(`Invalid mdx.format in ${filePath}: ${String(format)}`);
  const selected =
    format === 'detect'
      ? markdownExtensions.has(filePath.split('.').at(-1) ?? '')
        ? 'md'
        : 'mdx'
      : (format ?? 'mdx');
  return processors[selected].parse(escapeMarkdownHeadingIds(unwrapMdxCodeBlocks(markdown)));
};

export const extractTypeScriptExamples = async (
  markdown: string,
  filePath?: string,
): Promise<readonly TypeScriptExample[]> => {
  const tree = await parseDocumentation(markdown, filePath);
  const examples: TypeScriptExample[] = [];
  visit(tree, 'code', (node) => {
    const language = node.lang && languages.get(node.lang);
    if (language) examples.push({ code: node.value, meta: node.meta ?? '', language });
  });
  return examples;
};
