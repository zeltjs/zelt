import { onCloudflareWorkers } from '@zeltjs/adapter-cloudflare-workers';

import { app } from './app';

const cfApp = await onCloudflareWorkers(app);

export default {
  fetch: cfApp.fetch,
};
