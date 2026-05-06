#!/usr/bin/env node
import { runMain } from 'citty';

import { mainCommand } from './commands/main';

void runMain(mainCommand);
