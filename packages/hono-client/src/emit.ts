import { relative } from 'node:path';

export type RouteInfo = {
  readonly method: string;
  readonly path: string;
  readonly fullPath: string;
  readonly methodName: string;
};

export type ControllerRouteInfo = {
  readonly basePath: string;
  readonly sourceFile: string | undefined;
  readonly name: string;
  readonly routes: readonly RouteInfo[];
};

export type HttpMetadata = {
  readonly controllers: readonly ControllerRouteInfo[];
};

export type GenerateOptions = {
  readonly distDir: string;
};

type HttpAppLike = {
  getMetadata: () => HttpMetadata;
};

const stripTsExtension = (p: string): string => p.replace(/\.tsx?$/, '');

const toRelativeImport = (distDir: string, modulePath: string): string => {
  const rel = stripTsExtension(relative(distDir, modulePath));
  return rel.startsWith('.') ? rel : `./${rel}`;
};

const renderImport = (distDir: string, c: ControllerRouteInfo): string => {
  if (!c.sourceFile) {
    throw new Error(
      `Controller "${c.name}" has no sourceFile. Ensure @Controller decorator is applied.`,
    );
  }
  return `import type { ${c.name} } from '${toRelativeImport(distDir, c.sourceFile)}';`;
};

const renderRouteLine = (c: ControllerRouteInfo, r: RouteInfo): string =>
  `  Route<'${r.method}', '${r.fullPath}', typeof ${c.name}.prototype.${r.methodName}>,`;

const emitAppType = (metadata: HttpMetadata, distDir: string): string => {
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

export const generateHonoAppType = (app: HttpAppLike, options: GenerateOptions): string =>
  emitAppType(app.getMetadata(), options.distDir);
