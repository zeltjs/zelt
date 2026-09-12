import { onNode } from '@zeltjs/adapter-node';

import { app } from './app';

const nodeApp = await onNode(app);
const server = await nodeApp.http.listen(3000);

console.log(`ZeltJS is running at http://localhost:${server.address.port}`);
