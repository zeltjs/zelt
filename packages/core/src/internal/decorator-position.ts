import type { Position } from '@zeltjs/decorator-metadata';
import { getCallerPosition } from '@zeltjs/decorator-metadata';

const isCoreFrameworkPath = (path: string): boolean =>
  path.includes('/node_modules/') ||
  // Skip both monorepo source (packages/core/src/*) and built output
  // (packages/core/dist/*) so that consumers importing from the built dist
  // still get user-code positions in the stack trace.
  (path.includes('/packages/core/') && !/\.(test|spec)\./.test(path)) ||
  path.includes('/packages/decorator-metadata/');

export const getCallerPositionForCore = (): Position | undefined =>
  getCallerPosition({ isFrameworkPath: isCoreFrameworkPath });
