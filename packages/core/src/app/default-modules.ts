import type { Container } from '@needle-di/core';

import type { CommandCapabilities } from '../modules/command/module';
import { CommandModule } from '../modules/command/module';
import type { HttpCapabilities } from '../modules/http/module';
import { HttpModule } from '../modules/http/module';
import type { ModuleConfigMap } from '../modules/module';
import type { SchedulerCapabilities } from '../modules/scheduler/module';
import { SchedulerModule } from '../modules/scheduler/module';

export const DefaultModules = [HttpModule, CommandModule, SchedulerModule] as const;

export type DefaultModulesConfig = ModuleConfigMap<typeof DefaultModules>;

export const bindDefaultModules = (container: Container, options: DefaultModulesConfig): void => {
  if (options.http) {
    HttpModule.bind(container, options.http);
  }
  if (options.commands?.length) {
    CommandModule.bind(container, options.commands);
  }
  if (options.schedulers?.length) {
    SchedulerModule.bind(container, options.schedulers);
  }
};

export const resolveDefaultModuleCaps = (
  container: Container,
  options: DefaultModulesConfig,
): HttpCapabilities | CommandCapabilities | SchedulerCapabilities | object => ({
  ...(options.http ? HttpModule.resolve(container) : undefined),
  ...(options.commands?.length ? CommandModule.resolve(container) : undefined),
  ...(options.schedulers?.length ? SchedulerModule.resolve(container) : undefined),
});
