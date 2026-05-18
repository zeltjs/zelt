import { relative } from 'node:path';

import { ZeltDecoratorUsageError } from '@zeltjs/core';

import type { ControllerRouteInfo, HttpMetadata, RouteInfo } from './types';

const stripTsExtension = (p: string): string => p.replace(/\.tsx?$/, '');

const toRelativeImport = (distDir: string, modulePath: string): string => {
  const rel = stripTsExtension(relative(distDir, modulePath));
  return rel.startsWith('.') ? rel : `./${rel}`;
};

/** @throws {ZeltDecoratorUsageError} */
const renderImport = (distDir: string, c: ControllerRouteInfo): string => {
  if (!c.sourceFile) {
    throw new ZeltDecoratorUsageError({
      decoratorName: 'Controller',
      reason: 'missing_decorator',
      targetName: c.name,
    });
  }
  return `import type { ${c.name} } from '${toRelativeImport(distDir, c.sourceFile)}';`;
};

const renderRouteLine = (c: ControllerRouteInfo, r: RouteInfo): string =>
  `  Route<'${r.method}', '${r.fullPath}', typeof ${c.name}.prototype.${r.methodName}>,`;

/** @throws {ZeltDecoratorUsageError} */
export const emitAppType = (metadata: HttpMetadata, distDir: string): string => {
  const imports = metadata.controllers.map((c) => renderImport(distDir, c)).join('\n');

  const routes = metadata.controllers.flatMap((c) => c.routes.map((r) => renderRouteLine(c, r)));

  return [
    '// THIS FILE IS GENERATED. DO NOT EDIT.',
    "import type { Route, BuildAppType } from '@zeltjs/hono-client';",
    imports,
    '',
    'export type AppType = BuildAppType<[',
    ...routes,
    ']>;',
    '',
  ].join('\n');
};
