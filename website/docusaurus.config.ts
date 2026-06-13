import type * as Preset from '@docusaurus/preset-classic';
import type { Config } from '@docusaurus/types';
import type { PluginOptions as SearchPluginOptions } from '@easyops-cn/docusaurus-search-local';
import rehypeShiki from '@shikijs/rehype';
import sidebars from './sidebars.js';
import { remarkTwoslashBlock } from './src/remark/remark-twoslash-block';
import { twoslasher } from './src/twoslash/twoslasher';

type SidebarItem =
  | string
  | { type: 'category'; items: SidebarItem[] }
  | { type: 'link' }
  | { type: 'doc'; id: string };

const extractDocPaths = (items: SidebarItem[]): string[] =>
  items.flatMap((item): string[] => {
    if (typeof item === 'string') return [`${item}.md`];
    if (item.type === 'category') return extractDocPaths(item.items);
    if (item.type === 'doc') return [`${item.id}.md`];
    return [];
  });

const llmsIncludeOrder = extractDocPaths(sidebars.docsSidebar as SidebarItem[]);

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
  twoslasher,
  themes: shikiBaseConfig.themes,
  langs: shikiBaseConfig.langs,
};

const shikiOnly = {
  ...shikiBaseConfig,
  transformers: [],
};

const config: Config = {
  title: 'ZeltJS',
  tagline: 'Portable application framework with DI — swap adapters for different runtimes',
  favicon: 'img/favicon.png',

  future: {
    v4: true,
  },

  url: 'https://zeltjs.com',
  baseUrl: '/',

  organizationName: 'zeltjs',
  projectName: 'zelt',

  onBrokenLinks: 'throw',

  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'ja'],
  },

  headTags: [
    {
      tagName: 'link',
      attributes: {
        rel: 'preconnect',
        href: 'https://fonts.googleapis.com',
      },
    },
    {
      tagName: 'link',
      attributes: {
        rel: 'preconnect',
        href: 'https://fonts.gstatic.com',
        crossorigin: 'anonymous',
      },
    },
    {
      tagName: 'link',
      attributes: {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap',
      },
    },
    {
      tagName: 'link',
      attributes: {
        rel: 'apple-touch-icon',
        sizes: '180x180',
        href: '/img/apple-touch-icon.png',
      },
    },
    {
      tagName: 'link',
      attributes: {
        rel: 'alternate',
        type: 'text/markdown',
        href: '/llms.txt',
        title: 'LLM Documentation Index',
      },
    },
    {
      tagName: 'link',
      attributes: {
        rel: 'alternate',
        type: 'text/markdown',
        href: '/llms-full.txt',
        title: 'LLM Full Documentation',
      },
    },
  ],

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/zeltjs/zelt/tree/main/website/',
          routeBasePath: 'docs',
          remarkPlugins: [[remarkTwoslashBlock, twoslashBlockOptions]],
          rehypePlugins: [[rehypeShiki, shikiOnly]],
        },
        blog: false,
        pages: {
          remarkPlugins: [[remarkTwoslashBlock, twoslashBlockOptions]],
          rehypePlugins: [[rehypeShiki, shikiOnly]],
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  plugins: [
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'examples',
        path: 'examples',
        routeBasePath: 'examples',
        sidebarPath: './sidebars-examples.ts',
        editUrl: 'https://github.com/zeltjs/zelt/tree/main/website/',
        rehypePlugins: [[rehypeShiki, shikiOnly]],
      },
    ],
    [
      'docusaurus-plugin-llms',
      {
        generateLLMsTxt: true,
        generateLLMsFullTxt: true,
        docsDir: 'docs',
        title: 'Zelt Documentation',
        description: 'A fast, type-safe application framework for TypeScript',
        includeOrder: llmsIncludeOrder.filter((p) => p !== 'index.md'),
        includeUnmatchedLast: false,
        rootContent: `- [Introduction](https://zeltjs.com/docs/index.md): ZeltJS is a portable TypeScript application framework with built-in DI. Swap adapters to run on Node.js, Bun, Cloudflare Workers, or AWS Lambda.`,
      },
    ],
    'docusaurus-markdown-source-plugin',
    [
      '@docusaurus/plugin-client-redirects',
      {
        redirects: [
          { from: '/docs/quickstart', to: '/docs/getting-started' },
          { from: '/docs/quick-start', to: '/docs/getting-started' },
          { from: '/docs/introduction', to: '/docs/' },
          { from: '/docs/overview', to: '/docs/' },
          { from: '/docs/installation', to: '/docs/getting-started' },
          { from: '/docs/adapters', to: '/docs/getting-started' },
          { from: '/docs/adapter', to: '/docs/getting-started' },
          { from: '/docs/controller', to: '/docs/controllers' },
          { from: '/docs/getting-started/nodejs', to: '/docs/getting-started/node' },
          { from: '/docs/request-response', to: '/docs/primitives' },
          { from: '/docs/http', to: '/docs/controllers' },
          { from: '/docs/http/controllers', to: '/docs/controllers' },
          { from: '/docs/http/request', to: '/docs/primitives' },
          { from: '/docs/http/response', to: '/docs/primitives' },
          { from: '/docs/application', to: '/docs/getting-started' },
          { from: '/docs/runtime', to: '/docs/getting-started' },
          { from: '/docs/node', to: '/docs/getting-started/node' },
        ],
      },
    ],
  ],

  themes: [
    [
      '@easyops-cn/docusaurus-search-local',
      {
        hashed: true,
        language: ['en', 'ja'],
        indexDocs: true,
        indexBlog: false,
        docsRouteBasePath: 'docs',
        highlightSearchTermsOnTargetPage: true,
      } satisfies SearchPluginOptions,
    ],
  ],

  themeConfig: {
    image: 'img/zelt-social-card.png',
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'ZeltJS',
      logo: {
        alt: 'Zelt Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Docs',
          to: '/docs',
        },
        {
          to: '/examples/drizzle-todo',
          position: 'left',
          label: 'Examples',
          activeBaseRegex: '/examples/',
        },
        {
          type: 'localeDropdown',
          position: 'right',
          dropdownItemsAfter: [],
          className: 'navbar__locale',
        },
        {
          href: 'https://github.com/zeltjs/zelt',
          position: 'right',
          className: 'navbar__github',
          'aria-label': 'GitHub repository',
        },
      ],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
