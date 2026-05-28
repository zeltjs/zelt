import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ZeltDecoratorUsageError } from '@zeltjs/core';
import { getSourcePosition } from '@zeltjs/decorator-metadata/inspect';

import type {
  ControllerClass,
  ControllerRouteInfo,
  HttpMetadata,
  RouteInfo,
} from './generator.types';

const stripTsExtension = (p: string): string => p.replace(/\.tsx?$/, '');

const toFilePath = (p: string): string => (p.startsWith('file://') ? fileURLToPath(p) : p);

const toPosixPath = (p: string): string => p.replaceAll('\\', '/');

export const toRelativeImport = (distDir: string, modulePath: string): string => {
  const filePath = toFilePath(modulePath);
  const rel = toPosixPath(stripTsExtension(relative(distDir, filePath)));
  return rel.startsWith('.') ? rel : `./${rel}`;
};

type ControllerWithSource = ControllerRouteInfo & { readonly sourceFile: string };

const resolveSourceFile = (
  cls: ControllerClass,
  info: ControllerRouteInfo,
): ControllerWithSource | undefined => {
  const sourceFile = getSourcePosition(cls)?.sourceFile;
  if (!sourceFile) return undefined;
  return { ...info, sourceFile };
};

/** @throws {ZeltDecoratorUsageError} */
const renderImport = (distDir: string, c: ControllerWithSource): string =>
  `import type { ${c.name} } from '${toRelativeImport(distDir, c.sourceFile)}';`;

const renderRouteLine = (c: ControllerRouteInfo, r: RouteInfo): string =>
  `  Route<'${r.method}', '${r.fullPath}', typeof ${c.name}.prototype.${r.methodName}>,`;

type EmitContext = {
  readonly metadata: HttpMetadata;
  readonly controllers: readonly ControllerClass[];
  readonly distDir: string;
};

const findControllerClass = (
  controllers: readonly ControllerClass[],
  name: string,
): ControllerClass | undefined => controllers.find((cls) => cls.name === name);

/** @throws {ZeltDecoratorUsageError} */
export const emitAppType = (ctx: EmitContext): string => {
  const controllersWithSource = ctx.metadata.controllers.map((info) => {
    const cls = findControllerClass(ctx.controllers, info.name);
    if (!cls) {
      throw new ZeltDecoratorUsageError({
        decoratorName: 'Controller',
        reason: 'missing_decorator',
        targetName: info.name,
      });
    }
    const resolved = resolveSourceFile(cls, info);
    if (!resolved) {
      throw new ZeltDecoratorUsageError({
        decoratorName: 'Controller',
        reason: 'missing_decorator',
        targetName: info.name,
      });
    }
    return resolved;
  });

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
