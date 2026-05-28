import { onNode } from '@zeltjs/adapter-node';
import { CliConfig } from '@zeltjs/core';

import { app } from './app.lib';

const nodeApp = await onNode(app);
const result = await nodeApp.execCommand([...nodeApp.args]);
nodeApp.get(CliConfig).exit(result.exitCode);
