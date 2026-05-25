import { Injectable } from '@zeltjs/core';
import type { WebhookHandlerInfo } from './decorators/webhook.decorators';
import { getWebhookHandlers, getWebhookMetadata } from './decorators/webhook.decorators';

export type DiscoveredWebhook = {
  readonly name: string;
  readonly handlers: readonly WebhookHandlerInfo[];
};

// Mirrors NestJS WebhooksExplorer: iterate a provider registry and surface
// only the classes carrying the @Webhook decorator, along with their
// @WebhookHandler methods. In Zelt the registry is just the array of
// provider classes the caller wants to inspect.
@Injectable()
export class WebhooksExplorer {
  constructor(private readonly providers: readonly (new (...args: never[]) => object)[]) {}

  getWebhooks(): readonly DiscoveredWebhook[] {
    return this.providers.flatMap((cls) => {
      const webhook = getWebhookMetadata(cls);
      if (!webhook) return [];
      return [{ name: webhook.name, handlers: getWebhookHandlers(cls) }];
    });
  }
}
