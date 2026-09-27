import { dirname } from 'node:path';

import ts from 'typescript';

import type { CoreResolver, Evidence, Feature, ResolvedConfig, Span } from '../core';
import type { ZeltContext, ZeltInput } from './zelt.types';
import { ZELT_PROVIDER } from './zelt-blueprint.lib';
import { resolveSymbol } from './zelt-runtime.lib';

/**
 * 作り直しの対象外(event・lifecycle)が使う、TS 側の共有索引。
 * blueprint 由来の材料はこの索引を使わない(付録D)。
 */

export const ZELT_FEATURES: readonly Feature[] = [
  'routes',
  'relations',
  'hints',
  'setup',
  'meanings',
  'di',
  'test-setups',
];

/** anchor は package の export symbol で引く。名前の見た目では判定しない(4.4) */
const ANCHOR_EXPORTS: Readonly<Record<string, readonly string[]>> = {
  '@zeltjs/core': ['inject', 'LifecycleManager'],
  '@zeltjs/eventbus': ['EventBusSchema'],
};

const packageDirOf = (config: ResolvedConfig, specifier: string): string | null => {
  const entry = config.sourceModules[specifier];
  return entry === undefined ? null : `${dirname(entry)}/`;
};

const anchorIndexOf = (resolver: CoreResolver): Map<ts.Declaration, string> => {
  const anchorNames = new Map<ts.Declaration, string>();
  for (const [specifier, names] of Object.entries(ANCHOR_EXPORTS)) {
    for (const name of names) {
      for (const declaration of resolver.exportsOf(specifier, [name])) {
        anchorNames.set(declaration, name);
      }
    }
  }
  return anchorNames;
};

const appClassesOf = (files: readonly ts.SourceFile[]): readonly ts.ClassDeclaration[] =>
  files.flatMap((file) =>
    file.statements.flatMap((statement) =>
      ts.isClassDeclaration(statement) && statement.name !== undefined ? [statement] : [],
    ),
  );

export const createZeltContext = (input: ZeltInput): ZeltContext => {
  const { config, resolver, program } = input;
  const appFiles = program
    .getSourceFiles()
    .filter(
      (file) => !file.isDeclarationFile && config.isIncluded(resolver.relativePath(file.fileName)),
    );
  return {
    input,
    checker: input.checker,
    config,
    resolver,
    appFiles,
    appClasses: appClassesOf(appFiles),
    eventBusDir: packageDirOf(config, '@zeltjs/eventbus'),
    anchors: anchorIndexOf(resolver),
    diagnostics: new Map(),
  };
};

export const note = (
  ctx: ZeltContext,
  feature: Feature,
  code: string,
  message: string,
  spans: readonly Span[],
): void => {
  const list = ctx.diagnostics.get(feature) ?? [];
  list.push({ code, message, subject: null, spans });
  ctx.diagnostics.set(feature, list);
};

export const spanOf = (ctx: ZeltContext, node: ts.Node, start?: number, end?: number): Span =>
  ctx.resolver.spanOf(node, start, end);

export const evidenceOf = (
  ctx: ZeltContext,
  node: ts.Node,
  start?: number,
  end?: number,
): readonly Evidence[] => [
  { provider: ZELT_PROVIDER, span: spanOf(ctx, node, start, end), basis: 'syntax' },
];

export const anchorOf = (ctx: ZeltContext, node: ts.Node): string | null => {
  for (const declaration of resolveSymbol(ctx.checker, node)?.declarations ?? []) {
    const name = ctx.anchors.get(declaration);
    if (name !== undefined) return name;
  }
  return null;
};
