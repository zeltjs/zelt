import type { CategoryPublic, ProductPublic } from './catalog.types';

export const catalogCategories: readonly CategoryPublic[] = [
  { slug: 'lighting', title: 'Lighting' },
  { slug: 'stationery', title: 'Stationery' },
  { slug: 'storage', title: 'Storage' },
];

export const catalogProducts: readonly ProductPublic[] = [
  {
    id: 'p_lamp',
    name: 'Desk Lamp',
    description: 'Dimmable task lamp for a focused desk setup.',
    category: 'lighting',
    priceCents: 12900,
    stock: 7,
    status: 'available',
  },
  {
    id: 'p_notebook',
    name: 'Notebook Set',
    description: 'Three lay-flat notebooks for planning and notes.',
    category: 'stationery',
    priceCents: 2400,
    stock: 3,
    status: 'low_stock',
  },
  {
    id: 'p_archive_box',
    name: 'Archive Box',
    description: 'Stackable document storage box.',
    category: 'storage',
    priceCents: 1800,
    stock: 0,
    status: 'sold_out',
  },
];
