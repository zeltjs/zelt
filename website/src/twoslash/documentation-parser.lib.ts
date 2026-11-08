import { escapeMarkdownHeadingIds, unwrapMdxCodeBlocks } from '@docusaurus/utils';
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

const documentationProcessor = createProcessor({
  format: 'mdx',
  remarkPlugins: [remarkFrontmatter],
});

export const parseDocumentation = (markdown: string) =>
  documentationProcessor.parse(escapeMarkdownHeadingIds(unwrapMdxCodeBlocks(markdown)));

export const extractTypeScriptExamples = (markdown: string): readonly TypeScriptExample[] => {
  const tree = parseDocumentation(markdown);
  const examples: TypeScriptExample[] = [];
  visit(tree, 'code', (node) => {
    const language = node.lang && languages.get(node.lang);
    if (language) examples.push({ code: node.value, meta: node.meta ?? '', language });
  });
  return examples;
};
