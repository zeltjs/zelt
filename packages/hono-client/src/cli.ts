import { onNode } from '@zeltjs/adapter-node';
import { CliConfig } from '@zeltjs/core';

import { app } from './app.lib';

const nodeApp = await onNode(app);
const result = await nodeApp.commands.execCommand([...nodeApp.args]);
if (result.exitCode !== 0 && result.reason) {
  globalThis.process.stderr.write(`${result.reason.message}\n`);
}
(await nodeApp.get(CliConfig)).exit(result.exitCode);
