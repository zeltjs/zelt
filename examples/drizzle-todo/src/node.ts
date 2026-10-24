import { onNode, serve } from '@zeltjs/adapter-node';

import { app } from './app';

const nodeApp = await onNode(app);

serve(nodeApp.http, { port: 3000 }, ({ port }) => {
  console.log(`Server running at http://localhost:${port}`);
});
