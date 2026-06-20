import { Injectable } from '@zeltjs/core';

import { getCloudflareRuntimeContext } from './cloudflare-runtime-context.lib';

@Injectable()
export class CloudflareBindingsService {
  /** @throws {ZeltContextNotAvailableError} */
  get<K extends keyof Env>(key: K): Env[K] {
    return getCloudflareRuntimeContext().env[key];
  }
}
