import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type * as Preset from '@docusaurus/preset-classic';
import type { Config } from '@docusaurus/types';
import type { PluginOptions as SearchPluginOptions } from '@easyops-cn/docusaurus-search-local';
import rehypeShiki from '@shikijs/rehype';
import { transformerTwoslash } from '@shikijs/twoslash';
import { createTwoslasher } from 'twoslash';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const tsLibDirectory = path.resolve(__dirname, '../node_modules/typescript/lib');

const twoslasher = createTwoslasher({
  vfsRoot: rootDir,
  tsLibDirectory,
  compilerOptions: {
    module: 99, // ESNext
    moduleResolution: 99, // NodeNext
    target: 99, // ESNext
    lib: ['lib.esnext.full.d.ts'],
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
    baseUrl: rootDir,
    // @zeltjs/* packages: resolved via explicit paths because pnpm's strict
    // node_modules structure doesn't work with Twoslash VFS.
    // Corresponding devDependencies in package.json ensure nx builds them first.
    paths: {
      '@zeltjs/validator-valibot': ['./packages/validator-valibot/dist/index.d.ts'],
      '@zeltjs/redis/testing': ['./packages/redis/dist/testing/index.d.ts'],
      '@zeltjs/testing/vitest': ['./packages/testing/dist/adapters/vitest.d.ts'],
      '@zeltjs/testing/jest': ['./packages/testing/dist/adapters/jest.d.ts'],
      '@zeltjs/testing/bun': ['./packages/testing/dist/adapters/bun.d.ts'],
      '@zeltjs/testing/node': ['./packages/testing/dist/adapters/node.d.ts'],
      '@zeltjs/*': ['./packages/*/dist/index.d.ts'],
      valibot: [
        './node_modules/.pnpm/valibot@1.0.0_typescript@6.0.2/node_modules/valibot/dist/index.d.ts',
      ],
      hono: ['./node_modules/.pnpm/hono@4.12.16/node_modules/hono/dist/types/index.d.ts'],
      'hono/*': ['./node_modules/.pnpm/hono@4.12.16/node_modules/hono/dist/types/*.d.ts'],
      ioredis: ['./node_modules/.pnpm/ioredis@5.10.1/node_modules/ioredis/built/index.d.ts'],
      bullmq: ['./node_modules/.pnpm/bullmq@5.76.9/node_modules/bullmq/dist/esm/index.d.ts'],
    },
  },
});

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

const shikiWithTwoslash = {
  ...shikiBaseConfig,
  transformers: [transformerTwoslash({ twoslasher })],
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
          rehypePlugins: [[rehypeShiki, shikiWithTwoslash]],
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
