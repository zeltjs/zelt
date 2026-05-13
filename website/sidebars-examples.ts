import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  examplesSidebar: [
    {
      type: 'category',
      label: 'Applications',
      collapsed: false,
      items: ['drizzle-todo', 'workers-url-shortener'],
    },
  ],
};

export default sidebars;
