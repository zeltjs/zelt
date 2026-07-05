import { Config } from '../config';

/**
 * @internal Platform adapters extend this class to tie background work
 * (after-response flush, fire-and-forget tasks) to the runtime's
 * post-response lifetime, e.g. Cloudflare's ExecutionContext.waitUntil.
 * The default is a no-op: long-lived processes outlive the response.
 */
@Config
export class WaitUntilAdaptor {
  waitUntil(_promise: Promise<void>): void {}
}
