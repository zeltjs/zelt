import type { Project } from 'ts-morph';

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

const buildControllerIR = (project: Project, spec: ControllerSpec): ControllerIR => {
  const sf = project.getSourceFile(spec.filePath);
  if (!sf) throw new Error(`zelt/openapi: source file not found: ${spec.filePath}`);
  const cls = sf.getClass(spec.exportName);
  if (!cls) {
    throw new Error(`zelt/openapi: class ${spec.exportName} not found in ${spec.filePath}`);
  }

  const ctrl = extractControllerDecorator(cls);
  if (!ctrl) {
    throw new Error(`zelt/openapi: ${spec.exportName} is missing @Controller decorator`);
  }

  const routes: RouteIR[] = [];
  for (const m of cls.getMethods()) {
    const route = extractRouteDecorator(m);
    if (!route) continue;
    const sig = analyzeHandlerSignature(m);
    const resp = analyzeResponseType(m);
    routes.push({
      ...route,
      ...sig,
      fullPath: joinPath(ctrl.basePath, route.path),
      methodName: m.getName(),
      responseType: resp,
    });
  }

  return {
    module: spec.filePath,
    exportName: spec.exportName,
    basePath: ctrl.basePath,
    routes,
  };
};

export const analyzeControllers = (
  project: Project,
  specs: readonly ControllerSpec[],
): readonly ControllerIR[] => specs.map((spec) => buildControllerIR(project, spec));
