import ts from 'typescript';

type ExampleLanguage = 'ts' | 'tsx';
export type TypeScriptExample = {
  readonly code: string;
  readonly meta: string;
  readonly language: ExampleLanguage;
};

// Use Twoslash's line-anchored filename notation before reading TypeScript's leading comments.
const disablesInCode = (code: string): boolean =>
  code
    .split(/(?=^[\t\v\f ]*\/\/\s?@filename: .+$)/m)
    .some(
      (file) =>
        ts
          .getLeadingCommentRanges(file, 0)
          ?.some(
            (comment) =>
              comment.kind === ts.SyntaxKind.SingleLineCommentTrivia &&
              /^\/\/\/?\s*@ts-nocheck\b/.test(file.slice(comment.pos, comment.end)),
          ) === true,
    );

export const disablesTypeChecking = (example: TypeScriptExample): boolean => {
  const tokens = example.meta.match(/(?:[^\s"']|"[^"]*"|'[^']*')+/g);
  return Boolean(tokens?.includes('no-check')) || disablesInCode(example.code);
};
