import type { Position, StackTrace } from '@zeltjs/decorator-metadata';
import { resolvePosition } from '@zeltjs/decorator-metadata';

const isCoreFrameworkPath = (path: string): boolean =>
  path.includes('/node_modules/') ||
  (path.includes('/packages/core/') && !/\.(test|spec)\./.test(path)) ||
  path.includes('/packages/decorator-metadata/');

export const resolvePositionForCore = (trace: StackTrace | undefined): Position | undefined =>
  resolvePosition(trace, { isFrameworkPath: isCoreFrameworkPath });
