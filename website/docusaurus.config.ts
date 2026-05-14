import type * as Preset from '@docusaurus/preset-classic';
import type { Config } from '@docusaurus/types';
import type { PluginOptions as SearchPluginOptions } from '@easyops-cn/docusaurus-search-local';
import kanagawa from './src/prism-theme-kanagawa';

const config: Config = {
  title: 'Zelt',
  tagline: 'A fast, type-safe application framework for TypeScript',
  favicon: 'img/favicon.ico',

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
          routeBasePath: '/',
        },
        blog: false,
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
      },
    ],
    'docusaurus-markdown-source-plugin',
  ],

  themes: [
    [
      '@easyops-cn/docusaurus-search-local',
      {
        hashed: true,
        language: ['en', 'ja'],
        indexDocs: true,
        indexBlog: false,
        docsRouteBasePath: '/',
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
      title: 'Zelt',
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
    prism: {
      theme: kanagawa,
      darkTheme: kanagawa,
      additionalLanguages: ['bash', 'typescript', 'json'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
