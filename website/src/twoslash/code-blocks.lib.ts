import type { Code } from 'mdast';
import { findCutNotations } from 'twoslash';

/** A fenced code block as the Markdown syntax tree has it. */
export type CodeBlock = Pick<Code, 'lang' | 'meta' | 'value'>;

/** A code block that the site renders, and the doc scripts check, through Twoslash. */
export type TwoslashBlock = { readonly lang: 'typescript' | 'tsx'; readonly code: string };

const twoslashLanguages: ReadonlyMap<string, TwoslashBlock['lang']> = new Map([
  ['ts', 'typescript'],
  ['typescript', 'typescript'],
  ['tsx', 'tsx'],
  ['typescriptreact', 'tsx'],
]);

export const twoslashSyntaxLanguages = [...new Set(twoslashLanguages.values())];

// Excerpts (```ts source=...```) are slices of real, separately type-checked apps, validated by
// check-example-excerpts.ts and by the test of the guide that shows them. They reference sibling
// modules that don't resolve in the isolated Twoslash VFS, so they are rendered as plain
// highlighted code instead of being type-checked.
export const twoslashBlock = ({ lang, meta, value }: CodeBlock): TwoslashBlock | undefined => {
  const canonical = lang == null ? undefined : twoslashLanguages.get(lang);
  if (canonical === undefined || /\bsource=/.test(meta ?? '')) return undefined;
  return { lang: canonical, code: value };
};

export const twoslashBlocks = (blocks: readonly CodeBlock[]): readonly TwoslashBlock[] =>
  blocks.flatMap((block) => twoslashBlock(block) ?? []);

/**
 * The code a Twoslash block shows on the page: Twoslash's own cut rules decide what is hidden.
 * @throws {TwoslashError} Mismatched cut markers, which Twoslash rejects when rendering too.
 */
export const visibleCode = (code: string): string => {
  const hidden = [...findCutNotations(code, { removals: [] })].sort(([a], [b]) => a - b);
  let shown = '';
  let from = 0;
  for (const [start, end] of hidden) {
    if (start > from) shown += code.slice(from, start);
    from = Math.max(from, end);
  }
  return shown + code.slice(from);
};
