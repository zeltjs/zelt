import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    'index',
    {
      type: 'category',
      label: 'Getting Started',
      collapsed: false,
      items: [
        'getting-started/index',
        'getting-started/node',
        'getting-started/bun',
        'getting-started/cloudflare-workers',
        'getting-started/lambda',
        'getting-started/electron',
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
      items: [
        'http-security',
        'rate-limiting',
        {
          type: 'category',
          label: 'Authentication',
          collapsed: false,
          items: [
            'authentication/overview',
            'authentication/user-context',
            'authentication/jwt',
            'authentication/sessions',
            'authentication/custom',
          ],
        },
        {
          type: 'category',
          label: 'Authorization',
          collapsed: false,
          items: ['authorization/roles', 'authorization/access-control'],
        },
      ],
    },
    {
      type: 'category',
      label: 'Core',
      collapsed: false,
      items: ['dependency-injection', 'services', 'configuration', 'error-handling', 'logging'],
    },
    {
      type: 'category',
      label: 'Electron',
      collapsed: false,
      items: ['electron/ipc-bridge', 'electron/window-management'],
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
      label: 'LLM',
      collapsed: true,
      items: [
        {
          type: 'link',
          label: 'llms.txt',
          href: 'pathname:///llms.txt',
        },
        {
          type: 'link',
          label: 'llms-full.txt',
          href: 'pathname:///llms-full.txt',
        },
      ],
    },
    {
      type: 'link',
      label: 'Examples',
      href: '/examples/drizzle-todo',
    },
  ],
};

export default sidebars;
