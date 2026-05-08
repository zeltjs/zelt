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
    'testing',
    {
      type: 'category',
      label: 'Integrations',
      collapsed: false,
      items: ['hono-client', 'openapi'],
    },
    'examples',
  ],
};

export default sidebars;
