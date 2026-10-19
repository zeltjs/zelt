import { onNode } from '@zeltjs/adapter-node';
import { createApp, httpServer } from '@zeltjs/core';

import { app } from './app';

const nodeApp = await onNode(createApp([...app.features, httpServer()], { configs: app.configs }));

const { address } = await nodeApp.httpServer.listen(nodeApp.http, { port: 3000 });
console.log(`Server running at http://localhost:${address.port}`);
