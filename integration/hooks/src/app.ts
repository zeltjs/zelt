import { CliConfig, createApp } from '@zeltjs/core';

import { DependencyProbeController } from './dependency-probe.controller';
import { ProbeController } from './probe.controller';
import { TestCliConfig } from './test-cli.config';

// Factory because each spec needs an isolated app instance for clean lifecycle counting.
export const buildApp = () =>
  createApp({
    http: {
      controllers: [ProbeController],
    },
  });

// Builder for dependency-order and no-hook specs.
export const buildDependencyApp = () =>
  createApp({
    http: {
      controllers: [DependencyProbeController],
    },
  });

// Builder for signal specs: TestCliConfig overrides CliConfig so onSignal/offSignal are observable.
export const buildSignalApp = () =>
  createApp({
    http: {
      controllers: [ProbeController],
    },
    configs: [TestCliConfig],
  });

export { CliConfig };
