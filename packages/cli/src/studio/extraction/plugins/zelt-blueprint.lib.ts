import type {
  CoreDeclarationSite,
  CoreResolver,
  CoreSetupSite,
  CoreSourceSite,
  Evidence,
  ExportRef,
  Feature,
  Material,
  ResolvedConfig,
  Span,
} from '../core';
import type {
  ZeltClass,
  ZeltClassRef,
  ZeltInspection,
  ZeltMiddlewareUse,
  ZeltPosition,
} from './zelt-inspect-protocol';

/**
 * 子プロセスが返した Zelt の記録を、コアの宣言に結んで材料にする。
 * ここが持つ所在は相対 path と行だけで、AST は触らない(付録D)。
 */

export const ZELT_PROVIDER = 'zelt';

/** middleware instance が実装する実行 method(middleware.types.ts の MiddlewareInstance) */
const MIDDLEWARE_EXEC_METHOD = 'use';

/** createInjectableClassDecorator 経由で injectable() が付く class decorator */
const INJECTABLE_DECORATORS: readonly string[] = [
  'Injectable',
  'Controller',
  'Middleware',
  'Config',
];

const CONFIG_DECORATOR = 'Config';

export type BlueprintInput = {
  readonly config: ResolvedConfig;
  readonly resolver: CoreResolver;
  readonly inspection: ZeltInspection;
  readonly note: (feature: Feature, code: string, message: string, spans: readonly Span[]) => void;
};

/** 地図に載っている宣言。id が無いもの(ignore・未収録)は材料にしない */
type Subject = { readonly id: string; readonly span: Span; readonly text: string };

const resolved = (site: CoreDeclarationSite | null): Subject | null =>
  site === null || site.id === null ? null : { id: site.id, span: site.span, text: site.text };

const evidenceOf = (site: CoreSourceSite): readonly Evidence[] => [
  // 事実の出どころは runtime の記録、原文は索引から引いた所在
  { provider: ZELT_PROVIDER, span: site.span, basis: 'metadata' },
];

const nameOf = (ref: ZeltClassRef): string => `${ref.package ?? ref.filePath}#${ref.exportName}`;

/** runtime の class 参照を、config の対応表で索引の module へ移す(付録D) */
const exportRefOf = (input: BlueprintInput, ref: ZeltClassRef): ExportRef | null => {
  if (ref.package === null) return { filePath: ref.filePath, exportName: ref.exportName };
  const module = input.config.sourceModules[ref.package];
  if (module === undefined) return null;
  return { filePath: input.resolver.relativePath(module), exportName: ref.exportName };
};

const classSiteOf = (input: BlueprintInput, ref: ZeltClassRef): Subject | null => {
  const exportRef = exportRefOf(input, ref);
  return exportRef === null ? null : resolved(input.resolver.exportSite(exportRef));
};

const memberSiteOf = (input: BlueprintInput, ref: ZeltClassRef, member: string): Subject | null => {
  const exportRef = exportRefOf(input, ref);
  return exportRef === null ? null : resolved(input.resolver.memberSite(exportRef, member));
};

const setupSiteAt = (
  input: BlueprintInput,
  subject: string,
  kind: CoreSetupSite['kind'],
  at: (site: CoreSetupSite) => boolean,
): CoreSetupSite | null =>
  input.resolver.setupSites(subject).find((site) => site.kind === kind && at(site)) ?? null;

const decoratorSiteAt = (
  input: BlueprintInput,
  subject: string,
  position: ZeltPosition | null,
): CoreSetupSite | null =>
  position === null
    ? null
    : setupSiteAt(
        input,
        subject,
        'decorator',
        (site) => site.span.filePath === position.filePath && site.span.startLine === position.line,
      );

// ─── 登録(app → class) ───

const registerMaterials = (input: BlueprintInput, appId: string): Material[] => {
  const materials: Material[] = [];
  for (const ref of input.inspection.registered) {
    const target = classSiteOf(input, ref);
    const exportRef = exportRefOf(input, ref);
    if (target === null || exportRef === null) {
      input.note('relations', 'zelt-register-unresolved', `${nameOf(ref)} is not on the map`, []);
      continue;
    }
    const mention = input.resolver.mentionSites(appId, exportRef)[0];
    if (mention === undefined) {
      input.note('relations', 'zelt-register-site-unresolved', nameOf(ref), []);
      continue;
    }
    materials.push({
      kind: 'relation',
      from: appId,
      to: target.id,
      relation: 'register',
      applicationId: input.inspection.applicationId,
      order: null,
      evidence: evidenceOf(mention),
    });
  }
  return materials;
};

// ─── middleware ───

/** 1本の middleware 適用。chain の位置がそのまま実行時に通る順になる */
type ChainEntry = { readonly to: string | null; readonly site: CoreSourceSite | null };

/** app が書いた登録はその式が根拠。見つからないときは middleware の宣言に落とす */
const globalSiteOf = (
  input: BlueprintInput,
  ref: ZeltClassRef,
  appId: string,
): CoreSourceSite | null => {
  const declaration = classSiteOf(input, ref);
  const exportRef = exportRefOf(input, ref);
  const mention = exportRef === null ? undefined : input.resolver.mentionSites(appId, exportRef)[0];
  return mention ?? declaration;
};

const globalEntry = (input: BlueprintInput, ref: ZeltClassRef, appId: string): ChainEntry => ({
  to: memberSiteOf(input, ref, MIDDLEWARE_EXEC_METHOD)?.id ?? null,
  site: globalSiteOf(input, ref, appId),
});

const useEntry = (input: BlueprintInput, subject: string, use: ZeltMiddlewareUse): ChainEntry => ({
  to:
    use.target === null
      ? null
      : (memberSiteOf(input, use.target, MIDDLEWARE_EXEC_METHOD)?.id ?? null),
  site: decoratorSiteAt(input, subject, use.position),
});

const usesOn = (cls: ZeltClass, method: string | null): readonly ZeltMiddlewareUse[] =>
  cls.middlewares.filter((use) =>
    method === null ? use.on.kind === 'class' : use.on.kind === 'method' && use.on.name === method,
  );

type RouteSite = {
  readonly cls: ZeltClass;
  readonly controller: Subject;
  readonly methodName: string;
  readonly method: Subject;
};

/**
 * route が通る middleware を登録順に並べる。router 全体(app が feature に書いたもの)→
 * controller の `@UseMiddleware` → method の `@UseMiddleware` → `@Authorized` の順に
 * 登録される(http.service.ts と routing/route-builder.lib.ts)。
 */
const chainOf = (input: BlueprintInput, site: RouteSite, appId: string): readonly ChainEntry[] => [
  ...input.inspection.globalMiddlewares.map((ref) => globalEntry(input, ref, appId)),
  ...usesOn(site.cls, null).map((use) => useEntry(input, site.controller.id, use)),
  ...usesOn(site.cls, site.methodName).map((use) => useEntry(input, site.method.id, use)),
  ...site.cls.authorized
    .filter((authorized) => authorized.methodName === site.methodName)
    .map(
      (authorized): ChainEntry => ({
        to: null,
        site: decoratorSiteAt(input, site.method.id, authorized.position),
      }),
    ),
];

const chainMaterials = (
  input: BlueprintInput,
  subject: string,
  chain: readonly ChainEntry[],
): Material[] => {
  const materials: Material[] = [];
  // chain の位置がそのまま「この route が通る順」なので、解決できなかった要素でも詰めない
  for (const [order, entry] of chain.entries()) {
    if (entry.to === null || entry.site === null) continue;
    materials.push({
      kind: 'relation',
      from: subject,
      to: entry.to,
      relation: 'middleware',
      applicationId: input.inspection.applicationId,
      order,
      evidence: evidenceOf(entry.site),
    });
  }
  return materials;
};

// ─── route ───

const routeMaterials = (
  input: BlueprintInput,
  classes: ReadonlyMap<string, ZeltClass>,
  appId: string,
): Material[] => {
  const materials: Material[] = [];
  for (const route of input.inspection.routes) {
    const controller = classSiteOf(input, route.controller);
    const method = memberSiteOf(input, route.controller, route.methodName);
    const cls = classes.get(nameOf(route.controller));
    if (controller === null || method === null || cls === undefined) {
      input.note(
        'routes',
        'zelt-route-unresolved',
        `${nameOf(route.controller)}.${route.methodName}`,
        [],
      );
      continue;
    }
    const label = `${route.method} ${route.fullPath}`;
    const site: RouteSite = { cls, controller, methodName: route.methodName, method };
    materials.push(
      { kind: 'hint', subject: method.id, label, evidence: evidenceOf(method) },
      {
        kind: 'route',
        subject: method.id,
        registrationKey: label,
        applicationId: input.inspection.applicationId,
        method: route.method,
        path: route.fullPath,
        evidence: evidenceOf(method),
      },
      ...chainMaterials(input, method.id, chainOf(input, site, appId)),
    );
  }
  return materials;
};

// ─── class(DI・setup) ───

const injectSetups = (input: BlueprintInput, cls: ZeltClass, constructorId: string): Material[] => {
  const materials: Material[] = [];
  for (const dependency of cls.dependencies) {
    const site = setupSiteAt(
      input,
      constructorId,
      'parameter-default',
      (candidate) => candidate.span.startLine === dependency.line,
    );
    if (site === null) {
      input.note(
        'setup',
        'zelt-inject-unresolved',
        `${nameOf(cls.ref)}.${dependency.localName}`,
        [],
      );
      continue;
    }
    const target = dependency.target === null ? null : classSiteOf(input, dependency.target);
    materials.push({
      kind: 'setup',
      subject: constructorId,
      setup: 'inject',
      label: site.text,
      target: target?.id ?? null,
      evidence: evidenceOf(site),
    });
  }
  return materials;
};

/** Config class は library の Config を差し替える。線ではなく setup(4.1) */
const configOverrideSetup = (
  input: BlueprintInput,
  cls: ZeltClass,
  classId: string,
): Material[] => {
  if (!cls.decorators.includes(CONFIG_DECORATOR) || cls.base === null) return [];
  const site = setupSiteAt(input, classId, 'extends', () => true);
  if (site === null) {
    input.note('setup', 'zelt-config-base-unresolved', nameOf(cls.ref), []);
    return [];
  }
  const target = classSiteOf(input, cls.base);
  return [
    {
      kind: 'setup',
      subject: classId,
      setup: 'config-override',
      label: `@${CONFIG_DECORATOR} ${site.text}`,
      target: target?.id ?? null,
      evidence: evidenceOf(site),
    },
  ];
};

const middlewareSetupOf = (
  input: BlueprintInput,
  subject: string,
  use: ZeltMiddlewareUse,
  name: string,
): Material[] => {
  const site = decoratorSiteAt(input, subject, use.position);
  if (site === null) {
    input.note('setup', 'zelt-middleware-position-unresolved', name, []);
    return [];
  }
  const target = use.target === null ? null : classSiteOf(input, use.target);
  return [
    {
      kind: 'setup',
      subject,
      setup: 'middleware',
      label: site.text,
      target: target?.id ?? null,
      evidence: evidenceOf(site),
    },
  ];
};

const holderOf = (
  input: BlueprintInput,
  cls: ZeltClass,
  classSite: Subject,
  on: ZeltMiddlewareUse['on'],
): Subject | null => (on.kind === 'class' ? classSite : memberSiteOf(input, cls.ref, on.name));

const middlewareSetups = (
  input: BlueprintInput,
  cls: ZeltClass,
  classSite: Subject,
): Material[] => {
  const materials: Material[] = [];
  for (const use of cls.middlewares) {
    const holder = holderOf(input, cls, classSite, use.on);
    if (holder === null) continue;
    materials.push(...middlewareSetupOf(input, holder.id, use, nameOf(cls.ref)));
  }
  for (const authorized of cls.authorized) {
    const on: ZeltMiddlewareUse['on'] = { kind: 'method', name: authorized.methodName };
    const holder = holderOf(input, cls, classSite, on);
    if (holder === null) continue;
    materials.push(
      ...middlewareSetupOf(
        input,
        holder.id,
        { target: null, on, position: authorized.position },
        nameOf(cls.ref),
      ),
    );
  }
  return materials;
};

const diMaterials = (input: BlueprintInput, cls: ZeltClass, classSite: Subject): Material[] => {
  if (!cls.decorators.some((name) => INJECTABLE_DECORATORS.includes(name))) return [];
  const constructorSite = memberSiteOf(input, cls.ref, 'constructor');
  return [
    {
      kind: 'di',
      subject: classSite.id,
      value: cls.decorators.includes(CONFIG_DECORATOR) ? 'config' : 'service',
      evidence: evidenceOf(classSite),
    },
    ...(constructorSite === null
      ? []
      : [
          {
            kind: 'hint' as const,
            subject: constructorSite.id,
            label: 'DI / 初期化',
            evidence: evidenceOf(constructorSite),
          },
        ]),
  ];
};

/** 地図に載る(config の include に入る)class にだけ意味を付ける */
const isMapped = (input: BlueprintInput, ref: ZeltClassRef): boolean =>
  ref.package === null && input.config.isIncluded(ref.filePath);

const classMaterials = (input: BlueprintInput, cls: ZeltClass): Material[] => {
  const classSite = classSiteOf(input, cls.ref);
  if (classSite === null) {
    input.note('meanings', 'zelt-class-unresolved', `${nameOf(cls.ref)} is not on the map`, []);
    return [];
  }
  const constructorSite = memberSiteOf(input, cls.ref, 'constructor');
  return [
    ...diMaterials(input, cls, classSite),
    ...configOverrideSetup(input, cls, classSite.id),
    ...(constructorSite === null ? [] : injectSetups(input, cls, constructorSite.id)),
    ...middlewareSetups(input, cls, classSite),
  ];
};

export const blueprintMaterials = (input: BlueprintInput): readonly Material[] => {
  const app = resolved(input.resolver.exportSite(input.inspection.app));
  if (app === null) {
    input.note(
      'relations',
      'zelt-application-unresolved',
      `${input.inspection.app.filePath}#${input.inspection.app.exportName}`,
      [],
    );
    return [];
  }
  const classes = new Map(input.inspection.classes.map((cls) => [nameOf(cls.ref), cls]));
  return [
    ...registerMaterials(input, app.id),
    ...input.inspection.classes
      .filter((cls) => isMapped(input, cls.ref))
      .flatMap((cls) => classMaterials(input, cls)),
    ...routeMaterials(input, classes, app.id),
  ];
};
