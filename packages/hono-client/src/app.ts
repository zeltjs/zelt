import type { CommandApp } from '@zeltjs/core';
import { createApp } from '@zeltjs/core';

import { GenerateCommand } from './commands';

export const app: CommandApp = createApp({
  commands: [GenerateCommand],
});
