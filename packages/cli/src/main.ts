import { defineCommand } from 'citty';

import { buildCommand } from './build.command';
import { devCommand } from './dev.command';
import { runCommandDef } from './run.command';

export const mainCommand = defineCommand({
  meta: {
    name: 'zelt',
    version: '0.0.1',
    description: 'Zelt Framework CLI',
  },
  subCommands: {
    build: buildCommand,
    dev: devCommand,
    run: runCommandDef,
  },
});
