import { Config, WaitUntilAdaptor } from '@zeltjs/core';
import { tryGetCloudflareRuntimeContext } from './cloudflare-runtime-context.lib';

/**
 * Only extends execution while inside a request handled via onCloudflareWorkers'
 * fetch (the ALS scope); outside it (future cron/queue/DO entry points) this is
 * a silent no-op and tasks may be killed when the event settles.
 */
@Config
export class CloudflareWorkersWaitUntilAdaptor extends WaitUntilAdaptor {
  override waitUntil(promise: Promise<void>): void {
    tryGetCloudflareRuntimeContext()?.ctx.waitUntil(promise);
  }
}
