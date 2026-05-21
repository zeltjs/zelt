import { rendererRich, transformerTwoslash } from '@shikijs/twoslash';
import type { Highlighter } from 'shiki';
import { createHighlighter } from 'shiki';
import type { TwoslashInstance } from 'twoslash';
import { visit } from 'unist-util-visit';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CodeNode = any;

export interface RemarkTwoslashBlockOptions {
  twoslasher: TwoslashInstance;
  themes: Record<string, string>;
  langs: string[];
}

let highlighterPromise: Promise<Highlighter> | null = null;

const getHighlighter = async (options: RemarkTwoslashBlockOptions) => {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: Object.values(options.themes),
      langs: options.langs,
    });
  }
  return highlighterPromise;
};

const isTypeScriptLang = (lang: string): boolean =>
  ['ts', 'tsx', 'typescript', 'typescriptreact'].includes(lang);

const hastToHtml = (node: Node): string => {
  if (node.type === 'text') {
    return escapeHtml(node.value ?? '');
  }
  if (node.type !== 'element') {
    return '';
  }
  const tagName = node.tagName;
  const props = node.properties ?? {};
  const attrs: string[] = [];
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    const attrName = key === 'className' ? 'class' : key;
    const attrValue = Array.isArray(value) ? value.join(' ') : String(value);
    attrs.push(`${attrName}="${escapeAttr(attrValue)}"`);
  }
  const openTag = attrs.length ? `<${tagName} ${attrs.join(' ')}>` : `<${tagName}>`;
  const children = (node.children ?? []).map((c: Node) => hastToHtml(c)).join('');
  return `${openTag}${children}</${tagName}>`;
};

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const escapeAttr = (text: string): string => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

// Base64 encode using browser-compatible API
const encodeBase64 = (text: string): string => {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(text, 'utf-8').toString('base64');
  }
  return btoa(
    encodeURIComponent(text).replace(/%([0-9A-F]{2})/g, (_, p1) =>
      String.fromCharCode(parseInt(p1, 16)),
    ),
  );
};

const findPreNode = (root: Node): Node | undefined =>
  root.children?.find((c: Node) => c.type === 'element' && c.tagName === 'pre');

const findCodeNode = (preNode: Node): Node | undefined =>
  preNode.children?.find((c: Node) => c.type === 'element' && c.tagName === 'code');

/**
 * Remark plugin that converts ```typescript code blocks into
 * <TwoslashBlock> MDX JSX elements with pre-computed twoslash HTML.
 *
 * Bypasses Docusaurus's MDXComponents.Pre/Code which strips custom attributes
 * from <pre>/<code> elements.
 */
export const remarkTwoslashBlock = (options: RemarkTwoslashBlockOptions) => {
  const { twoslasher, themes, langs } = options;

  return async (tree: Node): Promise<void> => {
    const highlighter = await getHighlighter(options);
    const lightTheme = themes.light ?? Object.values(themes)[0];
    const darkTheme = themes.dark ?? Object.values(themes)[0];

    const codeNodes: { node: CodeNode; parent: Node; index: number }[] = [];

    visit(tree, 'code', (node: CodeNode, index: number | undefined, parent: Node) => {
      if (parent && index !== undefined && node.lang) {
        codeNodes.push({ node, parent, index });
      }
    });

    for (const { node, parent, index } of codeNodes) {
      const lang = node.lang as string;
      const code = node.value as string;

      if (!langs.includes(lang)) continue;

      if (!isTypeScriptLang(lang)) continue;

      let twoslashHtml: string | null = null;
      let plainCodeHtml: string | null = null;

      try {
        const twoslashHast = highlighter.codeToHast(code, {
          lang,
          themes: { light: lightTheme, dark: darkTheme },
          transformers: [
            transformerTwoslash({
              twoslasher,
              renderer: rendererRich(),
              explicitTrigger: false,
            }),
          ],
        });

        const preNode = findPreNode(twoslashHast);
        if (!preNode) continue;
        const codeNode = findCodeNode(preNode);
        if (!codeNode) continue;

        twoslashHtml = hastToHtml(codeNode);

        const plainCode = extractPlainText(codeNode);

        const plainHast = highlighter.codeToHast(plainCode, {
          lang,
          themes: { light: lightTheme, dark: darkTheme },
        });
        const plainPre = findPreNode(plainHast);
        const plainCodeEl = plainPre ? findCodeNode(plainPre) : undefined;
        if (plainCodeEl) {
          plainCodeHtml = hastToHtml(plainCodeEl);
        }
      } catch (error) {
        // twoslash failed - leave as regular code block
        // eslint-disable-next-line no-console
        console.warn('[remark-twoslash-block] twoslash failed:', (error as Error).message);
        continue;
      }

      if (!twoslashHtml || !plainCodeHtml) continue;

      const encodedTwoslash = encodeBase64(twoslashHtml);
      const encodedPlain = encodeBase64(plainCodeHtml);

      // Use hName/hProperties pattern like Docusaurus mermaid plugin:
      // remark visits 'code', transforms to a leaf node with hName mapping to a custom tag.
      // The custom tag (lowercase to avoid HTML element conflict) maps to TwoslashBlock via MDXComponents.
      parent.children[index] = {
        type: 'twoslashBlock',
        data: {
          hName: 'twoslashblock',
          hProperties: {
            lang,
            dataTwoslashHtml: encodedTwoslash,
            dataPlainHtml: encodedPlain,
          },
        },
      };
    }
  };
};

const extractPlainText = (element: Node): string => {
  let text = '';
  for (const child of element.children ?? []) {
    if (child.type === 'text') {
      text += child.value;
    } else if (child.type === 'element') {
      const className = Array.isArray(child.properties?.className)
        ? child.properties.className.join(' ')
        : (child.properties?.className?.toString() ?? '');
      const classProp = Array.isArray(child.properties?.class)
        ? child.properties.class.join(' ')
        : (child.properties?.class?.toString() ?? '');
      const allClasses = `${className} ${classProp}`;
      if (
        allClasses.includes('twoslash-popup') ||
        allClasses.includes('twoslash-completion') ||
        allClasses.includes('twoslash-error-line') ||
        allClasses.includes('twoslash-tag-line') ||
        allClasses.includes('twoslash-meta-line')
      ) {
        continue;
      }
      text += extractPlainText(child);
    }
  }
  return text;
};
