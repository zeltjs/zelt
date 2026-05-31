import { command, createApp } from '@zeltjs/core';

import { GenerateCommand } from './commands';

export const app = createApp([command([GenerateCommand])]);
