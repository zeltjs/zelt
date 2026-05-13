import type { PrismTheme } from 'prism-react-renderer';

const kanagawa: PrismTheme = {
  plain: {
    color: '#f5f0ea',
    backgroundColor: '#1a1614',
  },
  styles: [
    {
      types: ['comment', 'prolog', 'doctype', 'cdata'],
      style: { color: '#7a6f63', fontStyle: 'italic' },
    },
    {
      types: ['punctuation'],
      style: { color: '#d4c4a8' },
    },
    {
      types: ['namespace'],
      style: { opacity: 0.7 },
    },
    {
      types: ['property', 'tag', 'constant', 'symbol', 'deleted'],
      style: { color: '#e07045' },
    },
    {
      types: ['boolean', 'number'],
      style: { color: '#f0a060' },
    },
    {
      types: ['selector', 'attr-name', 'string', 'char', 'builtin', 'inserted'],
      style: { color: '#a8b86a' },
    },
    {
      types: ['operator', 'entity', 'url', 'variable'],
      style: { color: '#d4a860' },
    },
    {
      types: ['atrule', 'attr-value', 'function', 'class-name'],
      style: { color: '#7e9cd8' },
    },
    {
      types: ['keyword'],
      style: { color: '#957fb8' },
    },
    {
      types: ['regex', 'important'],
      style: { color: '#f0a060' },
    },
    {
      types: ['important', 'bold'],
      style: { fontWeight: 'bold' },
    },
    {
      types: ['italic'],
      style: { fontStyle: 'italic' },
    },
    {
      types: ['entity'],
      style: { cursor: 'help' },
    },
  ],
};

export default kanagawa;
