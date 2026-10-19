import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ControllerWithSource } from './controller-sources.lib';

import type { ControllerRouteInfo, RouteInfo } from './generator.types';

const stripTsExtension = (p: string): string => p.replace(/\.tsx?$/, '');

const toFilePath = (p: string): string => (p.startsWith('file://') ? fileURLToPath(p) : p);

const toPosixPath = (p: string): string => p.replaceAll('\\', '/');

export const toRelativeImport = (distDir: string, modulePath: string): string => {
  const filePath = toFilePath(modulePath);
  const rel = toPosixPath(stripTsExtension(relative(distDir, filePath)));
  return rel.startsWith('.') ? rel : `./${rel}`;
};

const renderImport = (distDir: string, c: ControllerWithSource): string => {
  const binding = c.source.exportName === c.name ? c.name : `${c.source.exportName} as ${c.name}`;
  return `import type { ${binding} } from '${toRelativeImport(distDir, c.source.filePath)}';`;
};

const renderRouteLine = (c: ControllerRouteInfo, r: RouteInfo): string =>
  `  Route<'${r.method}', '${r.fullPath}', typeof ${c.name}.prototype.${r.methodName}>,`;

type EmitContext = {
  readonly controllers: readonly ControllerWithSource[];
  readonly distDir: string;
};

export const emitAppType = (ctx: EmitContext): string => {
  const controllersWithSource = ctx.controllers;

  const imports = controllersWithSource.map((c) => renderImport(ctx.distDir, c)).join('\n');
  const routes = controllersWithSource.flatMap((c) => c.routes.map((r) => renderRouteLine(c, r)));

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
