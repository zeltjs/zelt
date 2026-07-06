import { defineCommand } from 'citty';

import { buildCommand } from './build.command';
import { devCommand } from './dev.command';
import { graphqlCommand } from './graphql.command';
import { runCommandDef } from './run.command';
import { studioCommand } from './studio.command';

export const mainCommand = defineCommand({
  meta: {
    name: 'zelt',
    version: '0.0.1',
    description: 'Zelt Framework CLI',
  },
  subCommands: {
    build: buildCommand,
    dev: devCommand,
    graphql: graphqlCommand,
    run: runCommandDef,
    studio: studioCommand,
  },
});
