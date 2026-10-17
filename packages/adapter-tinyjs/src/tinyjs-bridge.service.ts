import { Injectable, inject, RuntimeShutdownService, ZeltLifecycleStateError } from '@zeltjs/core';
import { createFetchBridge } from './fetch-bridge.lib';
import { bridgeUrl } from './shared';
import { DEFAULT_TINYJS_ORIGIN, TINYJS_FETCH_METHOD } from './shared/bridge.types';
import { TinyjsAppAdaptor } from './tinyjs-app.adaptor';
import type { TinyjsBridge, TinyjsBridgeOptions, TinyjsBridgeTargets } from './tinyjs-bridge.types';
import { createBridgeFetchers } from './tinyjs-bridge-targets.lib';

@Injectable()
export class TinyjsBridgeService {
  constructor(
    private readonly adaptor = inject(TinyjsAppAdaptor),
    private readonly runtimeShutdown = inject(RuntimeShutdownService),
  ) {}

  /** @throws {ZeltLifecycleStateError} */
  private assertActive(operation: string): void {
    if (this.runtimeShutdown.state !== 'ready' || this.adaptor.isDisposed) {
      throw new ZeltLifecycleStateError({ operation, currentState: 'disposed' });
    }
  }

  /** @throws {ZeltLifecycleStateError | TypeError} */
  create(http: TinyjsBridgeTargets, options: TinyjsBridgeOptions = {}): TinyjsBridge {
    this.assertActive('create tinyjs bridge');
    const origin = bridgeUrl('/', options.origin ?? DEFAULT_TINYJS_ORIGIN).origin;
    const fetch = createFetchBridge(createBridgeFetchers(http), origin);
    return {
      api: {
        /** @throws {ZeltLifecycleStateError | TypeError} */
        [TINYJS_FETCH_METHOD]: async (payload) => {
          this.assertActive('call tinyjs bridge');
          return fetch(payload);
        },
      },
      /** @throws {ZeltLifecycleStateError} */
      init: (native) => {
        this.assertActive('initialize tinyjs app');
        this.adaptor.attach(native);
        // tinyjs awaits done before exiting; keep runtime cleanup in that lifetime.
        native.done = native.done.finally(this.runtimeShutdown.shutdown);
      },
    };
  }
}
