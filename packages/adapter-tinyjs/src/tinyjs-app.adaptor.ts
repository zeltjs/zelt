import { Injectable, ZeltLifecycleStateError } from '@zeltjs/core';
import type { TinyjsNativeApp } from './shared/bridge.types';

type TinyjsAppState = { app: TinyjsNativeApp | undefined; disposed: boolean };

@Injectable()
export class TinyjsAppAdaptor {
  constructor(private readonly state: TinyjsAppState = { app: undefined, disposed: false }) {}

  /** @throws {ZeltLifecycleStateError} */
  get native(): TinyjsNativeApp {
    if (!this.state.app || this.state.disposed) {
      throw new ZeltLifecycleStateError({
        operation: 'access tinyjs native app',
        currentState: this.state.disposed ? 'disposed' : 'pending',
      });
    }
    return this.state.app;
  }

  /** @throws {ZeltLifecycleStateError} */
  attach(app: TinyjsNativeApp): void {
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
