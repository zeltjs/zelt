import { InjectionToken } from '@needle-di/core';

import type { CommandClass } from '../modules/command/types';
import type { HttpOptions } from './modules/http-module';

export type SchedulerClass = new (...args: never[]) => object;

export const HTTP_OPTIONS = new InjectionToken<HttpOptions>('HTTP_OPTIONS');
export const COMMAND_OPTIONS = new InjectionToken<readonly CommandClass[]>('COMMAND_OPTIONS');
export const SCHEDULER_OPTIONS = new InjectionToken<readonly SchedulerClass[]>('SCHEDULER_OPTIONS');
