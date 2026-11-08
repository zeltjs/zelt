import type { Code } from 'mdast';
import remarkParse from 'remark-parse';
import ts from 'typescript';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';

type ExampleLanguage = 'ts' | 'tsx';
export type TypeScriptExample = {
  readonly code: string;
  readonly meta: string;
  readonly language: ExampleLanguage;
};

const languages = new Map<string, ExampleLanguage>([
  ['ts', 'ts'],
  ['typescript', 'ts'],
  ['tsx', 'tsx'],
  ['typescriptreact', 'tsx'],
]);

export const extractTypeScriptExamples = (markdown: string): readonly TypeScriptExample[] => {
  const tree = unified().use(remarkParse).parse(markdown);
  const examples: TypeScriptExample[] = [];
  visit(tree, 'code', (node: Code) => {
    const language = node.lang && languages.get(node.lang);
    if (language) examples.push({ code: node.value, meta: node.meta ?? '', language });
  });
  return examples;
};

const disablesInCode = (code: string): boolean => {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.JSX, code);
  let leading = true;
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (token === ts.SyntaxKind.SingleLineCommentTrivia) {
      const comment = scanner.getTokenText();
      if (/^\/\/\s*@filename\s*:/.test(comment)) leading = true;
      if (leading && /^\/\/\/?\s*@ts-nocheck\b/.test(comment)) return true;
    } else if (token > ts.SyntaxKind.LastTriviaToken) leading = false;
  }
  return false;
};

export const disablesTypeChecking = (example: TypeScriptExample): boolean => {
  const tokens = example.meta.match(/(?:[^\s"']|"[^"]*"|'[^']*')+/g);
  return Boolean(tokens?.includes('no-check')) || disablesInCode(example.code);
};
