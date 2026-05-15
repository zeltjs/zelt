import { onNode } from '@zeltjs/adapter-node';
import { CliConfig } from '@zeltjs/core';

import { app } from './app';

const nodeApp = await onNode(app);
const result = await nodeApp.execCommand([...nodeApp.args]);
nodeApp.getConfig(CliConfig).exit(result.exitCode);
