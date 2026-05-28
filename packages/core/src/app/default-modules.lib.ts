import type { Container } from '@needle-di/core';

import { CommandModule } from '../modules/command/command.module';
import { HttpModule } from '../modules/http/http.module';
import type { Module, ModuleConfigMap } from '../modules/module.types';
import { SchedulerModule } from '../modules/scheduler/scheduler.module';

export const DefaultModules = [HttpModule, CommandModule, SchedulerModule] as const;

export type DefaultModulesConfig = ModuleConfigMap<typeof DefaultModules>;

// Module[] に widening することで、ループ内で mod.bind(container, unknown) が型安全に呼べる
// (Module.bind は method syntax = bivariant なので unknown を受け付ける)
const modules: readonly Module[] = DefaultModules;

export const bindDefaultModules = (container: Container, options: DefaultModulesConfig): void => {
  const configs = new Map<string, unknown>(Object.entries(options));
  for (const mod of modules) {
    const config = configs.get(mod.key);
    if (config !== undefined) {
      mod.bind(container, config);
    }
  }
};

export const resolveDefaultModuleCaps = (
  container: Container,
  options: DefaultModulesConfig,
): object => {
  const configs = new Map<string, unknown>(Object.entries(options));
  let caps: object = {};
  for (const mod of modules) {
    if (configs.get(mod.key) !== undefined) {
      caps = { ...caps, ...mod.resolve(container) };
    }
  }
  return caps;
};
