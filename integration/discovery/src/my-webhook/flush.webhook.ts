import { Injectable } from '@zeltjs/core';

import { Webhook, WebhookHandler } from '../decorators/webhook.decorators';

@Injectable()
@Webhook({ name: 'flush' })
export class FlushWebhook {
  @WebhookHandler({ event: 'start' })
  onStart() {
    return 'flush started';
  }
}
