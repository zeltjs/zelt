// packages/contract/src/analyzer/internal-representation.ts
import type { Project, ClassDeclaration, MethodDeclaration } from 'ts-morph';

import { ok, err, type Result } from 'neverthrow';

import type { AnalyzerError } from '../errors';
import {
  extractControllerDecorator,
  extractRouteDecorator,
  type RouteDecoratorInfo,
} from './decorator';
import {
  analyzeHandlerSignature,
  type HandlerSignatureInfo,
  type RequestSchemaRef,
} from './handler';
import { analyzeResponseType, type ResponseTypeInfo } from './response-type';

const stripTrailingSlash = (s: string): string =>
  s.length > 1 && s.endsWith('/') ? s.slice(0, -1) : s;

const ensureLeadingSlash = (s: string): string => (s === '' || s.startsWith('/') ? s : `/${s}`);

const joinPath = (base: string, sub: string): string => {
  const a = stripTrailingSlash(base);
  const b = stripTrailingSlash(ensureLeadingSlash(sub));
  const joined = `${a}${b === '/' ? '' : b}`;
  return joined === '' ? '/' : joined;
};

export type RouteIR = RouteDecoratorInfo &
  HandlerSignatureInfo & {
    readonly fullPath: string;
    readonly methodName: string;
    readonly responseType: ResponseTypeInfo;
    readonly requestSchema: RequestSchemaRef;
  };

export type ControllerIR = {
  readonly module: string;
  readonly exportName: string;
  readonly basePath: string;
  readonly routes: readonly RouteIR[];
};

export type ControllerSpec = {
  readonly filePath: string;
  readonly exportName: string;
};

const buildMethodRoute = (
  m: MethodDeclaration,
  basePath: string,
): Result<RouteIR, AnalyzerError> | undefined => {
  const routeResult = extractRouteDecorator(m);
  if (routeResult === undefined) return undefined;
  if (routeResult.isErr()) return err(routeResult.error);
  const route = routeResult.value;

  const sigResult = analyzeHandlerSignature(m);
  if (sigResult.isErr()) return err(sigResult.error);
  const sig = sigResult.value;

  const resp = analyzeResponseType(m);
  return ok({
    ...route,
    ...sig,
    fullPath: joinPath(basePath, route.path),
    methodName: m.getName(),
    responseType: resp,
  });
};

const extractControllerRoutes = (
  cls: ClassDeclaration,
  basePath: string,
): Result<readonly RouteIR[], AnalyzerError> => {
  const routes: RouteIR[] = [];
  for (const m of cls.getMethods()) {
    const result = buildMethodRoute(m, basePath);
    if (result === undefined) continue;
    if (result.isErr()) return err(result.error);
    routes.push(result.value);
  }
  return ok(routes);
};

const buildControllerIR = (
  project: Project,
  spec: ControllerSpec,
): Result<ControllerIR, AnalyzerError> => {
  const sf = project.getSourceFile(spec.filePath);
  if (!sf) {
    return err({ type: 'SOURCE_FILE_NOT_FOUND', path: spec.filePath });
  }

  const cls = sf.getClass(spec.exportName);
  if (!cls) {
    return err({ type: 'CLASS_NOT_FOUND', className: spec.exportName, path: spec.filePath });
  }

  const ctrlResult = extractControllerDecorator(cls);
  if (ctrlResult === undefined) {
    return err({ type: 'CONTROLLER_DECORATOR_MISSING', className: spec.exportName });
  }
  if (ctrlResult.isErr()) {
    return err(ctrlResult.error);
  }
  const ctrl = ctrlResult.value;

  const routesResult = extractControllerRoutes(cls, ctrl.basePath);
  if (routesResult.isErr()) return err(routesResult.error);

  return ok({
    module: spec.filePath,
    exportName: spec.exportName,
    basePath: ctrl.basePath,
    routes: routesResult.value,
  });
};

export const analyzeControllers = (
  project: Project,
  specs: readonly ControllerSpec[],
): Result<readonly ControllerIR[], AnalyzerError> => {
  const results: ControllerIR[] = [];
  for (const spec of specs) {
    const result = buildControllerIR(project, spec);
    if (result.isErr()) return err(result.error);
    results.push(result.value);
  }
  return ok(results);
};
