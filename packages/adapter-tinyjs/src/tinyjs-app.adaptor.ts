import type { Lifecycle } from '@zeltjs/core';
import { Config, inject, LifecycleManager, ZeltLifecycleStateError } from '@zeltjs/core';
import type { TinyjsNativeApp } from './shared/bridge.types';

type TinyjsAppState<TNative> = { app: TNative | undefined; disposed: boolean };

@Config
export class TinyjsAppAdaptor<TNative extends TinyjsNativeApp = TinyjsNativeApp>
  implements Lifecycle
{
  constructor(
    private readonly state: TinyjsAppState<TNative> = { app: undefined, disposed: false },
    lifecycleManager = inject(LifecycleManager),
  ) {
    lifecycleManager.register(this);
  }

  startup(): void {}

  shutdown(): void {
    this.dispose();
  }

  get isDisposed(): boolean {
    return this.state.disposed;
  }

  /** @throws {ZeltLifecycleStateError} */
  get native(): TNative {
    if (!this.state.app || this.state.disposed) {
      throw new ZeltLifecycleStateError({
        operation: 'access tinyjs native app',
        currentState: this.state.disposed ? 'disposed' : 'pending',
      });
    }
    return this.state.app;
  }

  /** @throws {ZeltLifecycleStateError} */
  attach(app: TNative): void {
    if (this.state.app || this.state.disposed) {
      throw new ZeltLifecycleStateError({
        operation: 'attach tinyjs native app',
        currentState: this.state.disposed ? 'disposed' : 'ready',
      });
    }
    this.state.app = app;
  }

  dispose(): void {
    this.state.disposed = true;
    this.state.app = undefined;
  }
}
