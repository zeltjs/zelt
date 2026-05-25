import { Injectable } from '@zeltjs/core';

import { Webhook, WebhookHandler } from '../decorators/webhook.decorators';

@Injectable()
@Webhook({ name: 'cleanup' })
export class CleanupWebhook {
  @WebhookHandler({ event: 'start' })
  onStart() {
    return 'cleanup started';
  }
}
