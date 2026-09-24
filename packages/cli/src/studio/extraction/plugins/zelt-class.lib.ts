import ts from 'typescript';

import type { Material } from '../core';
import type { ChainEntry, Registration, RouteFact, ZeltContext } from './zelt.types';
import {
  anchorOf,
  evidenceOf,
  execIdOf,
  middlewareClassOf,
  note,
  registrationsOf,
  spanOf,
} from './zelt-context.lib';
import {
  classOfSymbol,
  decoratorArguments,
  decoratorCallee,
  firstLineOf,
  INJECTABLE_DECORATORS,
  joinPath,
  ROUTE_METHODS,
  resolveSymbol,
  stringLiteralOf,
} from './zelt-runtime.lib';

export type ClassFacts = {
  readonly materials: readonly Material[];
  readonly routes: readonly RouteFact[];
};

const middlewareSetupOf = (
  ctx: ZeltContext,
  subject: string,
  registration: Registration,
): Material => {
  const target =
    registration.middleware === null ? null : middlewareClassOf(ctx, registration.middleware);
  return {
    kind: 'setup',
    subject,
    setup: 'middleware',
    label: firstLineOf(registration.decorator.getText()),
    target: target === null ? null : ctx.resolver.subjectOf(target),
    evidence: evidenceOf(ctx, registration.decorator),
  };
};

/** ignore 推奨にした LifecycleManager への登録呼出は、消さずに setup に残す(4.1) */
const lifecycleSetup = (
  ctx: ZeltContext,
  ctor: ts.ConstructorDeclaration,
  subject: string,
  holders: ReadonlySet<ts.Symbol>,
): readonly Material[] => {
  if (holders.size === 0 || ctor.body === undefined) return [];
  const materials: Material[] = [];
  const visit = (node: ts.Node): void => {
    const callee = ts.isCallExpression(node) ? node.expression : undefined;
    const holder =
      callee !== undefined &&
      ts.isPropertyAccessExpression(callee) &&
      callee.name.text === 'register'
        ? ctx.checker.getSymbolAtLocation(callee.expression)
        : undefined;
    if (holder !== undefined && holders.has(holder)) {
      materials.push({
        kind: 'setup',
        subject,
        setup: 'lifecycle',
        label: firstLineOf(node.getText()),
        target: null,
        evidence: evidenceOf(ctx, node),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(ctor.body);
  return materials;
};

const injectCallOf = (
  ctx: ZeltContext,
  parameter: ts.ParameterDeclaration,
): ts.CallExpression | null => {
  const initializer = parameter.initializer;
  if (initializer === undefined || !ts.isCallExpression(initializer)) return null;
  return anchorOf(ctx, initializer.expression) === 'inject' ? initializer : null;
};

const injectSetupOf = (
  ctx: ZeltContext,
  subject: string,
  parameter: ts.ParameterDeclaration,
  call: ts.CallExpression,
  lifecycleHolders: Set<ts.Symbol>,
): Material => {
  const argument = call.arguments[0];
  if (argument !== undefined && anchorOf(ctx, argument) === 'LifecycleManager') {
    const symbol = ctx.checker.getSymbolAtLocation(parameter.name);
    if (symbol !== undefined) lifecycleHolders.add(symbol);
  }
  const injected =
    argument === undefined ? null : classOfSymbol(resolveSymbol(ctx.checker, argument));
  return {
    kind: 'setup',
    subject,
    setup: 'inject',
    label: firstLineOf(call.getText()),
    target: injected === null ? null : ctx.resolver.subjectOf(injected),
    evidence: evidenceOf(ctx, call),
  };
};

const constructorSetup = (
  ctx: ZeltContext,
  ctor: ts.ConstructorDeclaration,
): readonly Material[] => {
  const subject = ctx.resolver.subjectOf(ctor);
  if (subject === null) return [];
  const materials: Material[] = [];
  const lifecycleHolders = new Set<ts.Symbol>();
  for (const parameter of ctor.parameters) {
    const call = injectCallOf(ctx, parameter);
    if (call === null) continue;
    materials.push(injectSetupOf(ctx, subject, parameter, call, lifecycleHolders));
  }
  materials.push(...lifecycleSetup(ctx, ctor, subject, lifecycleHolders));
  return materials;
};

/** Config class は library の Config を差し替える。線ではなく setup(4.1) */
const configOverrideSetup = (
  ctx: ZeltContext,
  cls: ts.ClassDeclaration,
  subject: string,
): readonly Material[] =>
  (cls.heritageClauses ?? [])
    .filter((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword)
    .flatMap((clause) =>
      clause.types.map((type): Material => {
        const base = classOfSymbol(resolveSymbol(ctx.checker, type.expression));
        return {
          kind: 'setup',
          subject,
          setup: 'config-override',
          label: `@Config extends ${type.expression.getText()}`,
          target: base === null ? null : ctx.resolver.subjectOf(base),
          evidence: evidenceOf(ctx, clause),
        };
      }),
    );

type RouteSite = {
  readonly controller: ts.ClassDeclaration;
  readonly member: ts.MethodDeclaration;
  readonly subject: string;
  readonly basePath: string;
};

const routeOf = (ctx: ZeltContext, site: RouteSite, decorator: ts.Decorator): RouteFact | null => {
  const anchor = anchorOf(ctx, decoratorCallee(decorator));
  const method = anchor === null ? undefined : ROUTE_METHODS[anchor];
  if (method === undefined) return null;
  const path = stringLiteralOf(decoratorArguments(decorator)[0]);
  if (path === null) {
    note(ctx, 'routes', 'zelt-route-path-dynamic', 'route path is not a literal', [
      spanOf(ctx, decorator),
    ]);
    return null;
  }
  return {
    subject: site.subject,
    controller: site.controller,
    member: site.member,
    method,
    path: joinPath(site.basePath, path),
    decorator,
  };
};

const memberRoutes = (ctx: ZeltContext, site: RouteSite): readonly RouteFact[] => {
  const routes: RouteFact[] = [];
  for (const decorator of ts.getDecorators(site.member) ?? []) {
    const route = routeOf(ctx, site, decorator);
    if (route !== null) routes.push(route);
  }
  return routes;
};

const routesOfController = (
  ctx: ZeltContext,
  cls: ts.ClassDeclaration,
  basePath: string,
): ClassFacts => {
  const materials: Material[] = [];
  const routes: RouteFact[] = [];
  for (const member of cls.members) {
    if (!ts.isMethodDeclaration(member)) continue;
    const subject = ctx.resolver.subjectOf(member);
    if (subject === null) continue;
    for (const registration of registrationsOf(ctx, member)) {
      materials.push(middlewareSetupOf(ctx, subject, registration));
    }
    routes.push(...memberRoutes(ctx, { controller: cls, member, subject, basePath }));
  }
  return { materials, routes };
};

const diHint = (
  ctx: ZeltContext,
  ctor: ts.ConstructorDeclaration | undefined,
): readonly Material[] => {
  if (ctor === undefined) return [];
  const constructorId = ctx.resolver.subjectOf(ctor);
  if (constructorId === null) return [];
  return [
    {
      kind: 'hint',
      subject: constructorId,
      label: 'DI / 初期化',
      evidence: evidenceOf(ctx, ctor),
    },
  ];
};

const classSetupMaterials = (
  ctx: ZeltContext,
  cls: ts.ClassDeclaration,
  subject: string,
  anchors: readonly string[],
): Material[] => {
  const isConfig = anchors.includes('Config');
  const ctor = cls.members.find(ts.isConstructorDeclaration);
  const materials: Material[] = [];
  if (anchors.some((anchor) => INJECTABLE_DECORATORS.includes(anchor))) {
    materials.push({
      kind: 'di',
      subject,
      value: isConfig ? 'config' : 'service',
      evidence: evidenceOf(ctx, cls.name ?? cls),
    });
    materials.push(...diHint(ctx, ctor));
  }
  if (isConfig) materials.push(...configOverrideSetup(ctx, cls, subject));
  if (ctor !== undefined) materials.push(...constructorSetup(ctx, ctor));
  return materials;
};

const controllerFacts = (
  ctx: ZeltContext,
  cls: ts.ClassDeclaration,
  subject: string,
  decorators: readonly ts.Decorator[],
): ClassFacts => {
  const controller = decorators.find((d) => anchorOf(ctx, decoratorCallee(d)) === 'Controller');
  const basePath =
    controller === undefined ? null : stringLiteralOf(decoratorArguments(controller)[0]);
  if (basePath === null) {
    note(ctx, 'routes', 'zelt-base-path-dynamic', 'controller base path is not a literal', []);
    return { materials: [], routes: [] };
  }
  const materials: Material[] = [];
  for (const registration of registrationsOf(ctx, cls)) {
    materials.push(middlewareSetupOf(ctx, subject, registration));
  }
  const inner = routesOfController(ctx, cls, basePath);
  return { materials: [...materials, ...inner.materials], routes: inner.routes };
};

export const classFacts = (ctx: ZeltContext, cls: ts.ClassDeclaration): ClassFacts => {
  const subject = ctx.resolver.subjectOf(cls);
  if (subject === null) return { materials: [], routes: [] };
  const decorators = ts.getDecorators(cls) ?? [];
  const anchors = decorators.flatMap((decorator) => {
    const anchor = anchorOf(ctx, decoratorCallee(decorator));
    return anchor === null ? [] : [anchor];
  });
  const materials = classSetupMaterials(ctx, cls, subject, anchors);
  if (!anchors.includes('Controller')) return { materials, routes: [] };
  const controller = controllerFacts(ctx, cls, subject, decorators);
  return { materials: [...materials, ...controller.materials], routes: controller.routes };
};

const asChain = (registrations: readonly Registration[]): ChainEntry[] =>
  registrations.flatMap((registration) =>
    registration.middleware === null
      ? []
      : [{ expression: registration.middleware, evidence: registration.evidence }],
  );

/** route ごとの middleware は登録順(組込み → app → class → method)で組む(route-builder.lib.ts) */
export const routeFacts = (
  ctx: ZeltContext,
  route: RouteFact,
  prefix: readonly ChainEntry[],
): readonly Material[] => {
  const applicationId = ctx.input.applications[0]?.id ?? null;
  const materials: Material[] = [
    {
      kind: 'hint',
      subject: route.subject,
      label: `${route.method} ${route.path}`,
      evidence: evidenceOf(ctx, route.decorator),
    },
    {
      kind: 'route',
      subject: route.subject,
      registrationKey: `${route.method} ${route.path}`,
      applicationId: applicationId ?? '',
      method: route.method,
      path: route.path,
      evidence: evidenceOf(ctx, route.decorator),
    },
  ];
  const chain = [
    ...prefix,
    ...asChain(registrationsOf(ctx, route.controller)),
    ...asChain(registrationsOf(ctx, route.member)),
  ];
  // chain の位置がそのまま「この route が通る順」なので、解決できなかった要素でも
  // 位置を詰めない(実行時の順序は変わらないため)
  for (const [order, entry] of chain.entries()) {
    const to = execIdOf(ctx, entry.expression, 'relations');
    if (to === null) continue;
    materials.push({
      kind: 'relation',
      from: route.subject,
      to,
      relation: 'middleware',
      applicationId,
      order,
      evidence: evidenceOf(ctx, entry.evidence),
    });
  }
  return materials;
};
