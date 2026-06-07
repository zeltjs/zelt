import type { ConfiguredFeature } from '@zeltjs/core';
import { CliConfig, createApp, http } from '@zeltjs/core';

import { DependencyProbeController } from './dependency-probe.controller';
import { WarmupSpy } from './lifecycle-spy';
import { ProbeController } from './probe.controller';
import { TestCliConfig } from './test-cli.config';

type NoCapabilities = Record<never, never>;

const warmupProbe = (): ConfiguredFeature<'warmupProbe', NoCapabilities> => ({
  key: 'warmupProbe',
  staticCapabilities: () => ({}),
  createCapabilities: () => ({}),
  warmup: async (runtime) => {
    const spy = await runtime.get(WarmupSpy);
    spy.recordWarmup();
  },
});

// Factory because each spec needs an isolated app instance for clean lifecycle counting.
export const buildApp = () => createApp([http({ controllers: [ProbeController] }), warmupProbe()]);

// Builder for dependency-order and no-hook specs.
export const buildDependencyApp = () =>
  createApp([http({ controllers: [DependencyProbeController] })]);

// Builder for signal specs: TestCliConfig overrides CliConfig so onSignal/offSignal are observable.
export const buildSignalApp = () =>
  createApp([http({ controllers: [ProbeController] }), warmupProbe()], {
    configs: [TestCliConfig],
  });

export { CliConfig };
