import type { ResolverHandle } from '../di/container';
import type { LifecycleManager } from '../lifecycle';

export type ReadyContext = {
  readonly resolver: ResolverHandle;
  readonly lifecycle: LifecycleManager;
  readonly warmup: boolean;
};

export type Module = {
  setup: () => void;
  ready: (context: ReadyContext) => Promise<void>;
  shutdown: () => Promise<void>;
};
