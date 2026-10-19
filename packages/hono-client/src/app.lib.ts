import type { App, CommandCapabilities, ConfiguredFeature } from '@zeltjs/core';
import { command, createApp } from '@zeltjs/core';

import { GenerateCommand } from './commands';

export const app: App<readonly [ConfiguredFeature<'command', CommandCapabilities>]> = createApp([
  command([GenerateCommand]),
]);
