import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    'introduction',
    {
      type: 'category',
      label: 'Overview',
      items: ['first-steps', 'controllers', 'services', 'middleware'],
    },
    {
      type: 'category',
      label: 'Fundamentals',
      items: ['modules', 'dependency-injection', 'testing'],
    },
    {
      type: 'category',
      label: 'Techniques',
      items: ['validation', 'configuration', 'openapi'],
    },
  ],
};

export default sidebars;
