import { defineCommand } from 'citty';

import { buildCommand } from './build';
import { devCommand } from './dev';

export const mainCommand = defineCommand({
  meta: {
    name: 'zelt',
    version: '0.0.1',
    description: 'Zelt Framework CLI',
  },
  subCommands: {
    build: buildCommand,
    dev: devCommand,
  },
});
