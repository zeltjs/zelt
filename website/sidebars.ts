import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    'introduction',
    {
      type: 'category',
      label: 'Getting Started',
      collapsed: false,
      items: [
        'getting-started/basic',
        'getting-started/node',
        'getting-started/cloudflare-workers',
      ],
    },
    {
      type: 'category',
      label: 'HTTP',
      collapsed: false,
      items: ['controllers', 'middleware', 'primitives', 'validation'],
    },
    {
      type: 'category',
      label: 'Security',
      collapsed: false,
      items: ['authentication', 'rate-limiting'],
    },
    {
      type: 'category',
      label: 'Core',
      collapsed: false,
      items: ['dependency-injection', 'services', 'configuration', 'error-handling', 'logging'],
    },
    {
      type: 'category',
      label: 'CLI',
      collapsed: false,
      items: ['command', 'scheduler'],
    },
    {
      type: 'category',
      label: 'Storage',
      collapsed: false,
      items: ['kv', 'kv-redis'],
    },
    {
      type: 'category',
      label: 'Testing',
      collapsed: false,
      items: ['testing/unit', 'testing/integration', 'testing/e2e'],
    },
    {
      type: 'category',
      label: 'Integrations',
      collapsed: false,
      items: ['hono-client', 'openapi', 'bullmq'],
    },
    {
      type: 'category',
      label: 'Examples',
      collapsed: false,
      items: ['examples/drizzle-todo', 'examples/workers-url-shortener'],
    },
  ],
};

export default sidebars;
