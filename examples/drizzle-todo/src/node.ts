import { onNode } from '@zeltjs/adapter-node';

import { app } from './app';

const nodeApp = await onNode(app);

const { address } = await nodeApp.listen(3000);
console.log(`Server running at http://localhost:${address.port}`);
