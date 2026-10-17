import { waitUntil } from 'cloudflare:workers';
import { Config, WaitUntilAdaptor } from '@zeltjs/core';
@Config
export class CloudflareWorkersWaitUntilAdaptor extends WaitUntilAdaptor {
  override waitUntil(promise: Promise<void>): void {
    waitUntil(promise);
  }
}
