import { serve, type AddressInfo } from '@zeltjs/adapter-node';

import { app } from '../app';

serve(app, { port: 3000 }, (info: AddressInfo) => {
  console.log(`Server running at http://localhost:${info.port}`);
});
