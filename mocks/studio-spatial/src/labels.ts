import type { SetupItem, SourceDeclaration, SourceRelation } from './snapshot.types';

// Keys cover TS kinds and the meanings/granted kinds known plugins give; unknown kinds show as-is.
const relationLabels: ReadonlyMap<string, string> = new Map(
  Object.entries({
    call: '呼ぶ',
    read: '読む / 参照',
    contract: '契約を呼ぶ',
    type: '型参照',
    schema: '入力検証schema参照',
    table: 'table参照',
    middleware: 'middleware適用',
    event: 'event配送',
    register: '登録',
    extends: '継承',
    implements: '実装',
    override: 'override',
    construct: '生成',
  }),
);
const declarationLabels: ReadonlyMap<string, string> = new Map(
  Object.entries({
    method: 'METHOD',
    constructor: 'CTOR',
    function: 'FUNCTION',
    callback: 'CALLBACK',
    property: 'PROP',
    getter: 'GET',
    signature: 'SIGNATURE',
    type: 'TYPE',
    schema: 'SCHEMA',
    table: 'TABLE',
    value: 'VALUE',
    'event-type': 'EVENT TYPE',
  }),
);
const setupLabels: ReadonlyMap<string, string> = new Map(
  Object.entries({
    inject: '注入',
    middleware: 'middleware指定',
    'config-override': '設定の差し替え',
    lifecycle: 'lifecycle登録',
  }),
);

export const relationKinds: readonly string[] = [...relationLabels.keys()];

function lookup(labels: ReadonlyMap<string, string>, kind: string): string {
  return labels.get(kind) ?? kind;
}

// A granted meaning replaces only what is shown; the TS fact is kept underneath.
export function relationKind(relation: SourceRelation): string {
  return relation.origin === 'plugin'
    ? relation.kind
    : (relation.meanings.at(0)?.kind ?? relation.kind);
}

export function grantedKind(relation: SourceRelation): string | null {
  return relation.origin === 'plugin' ? relation.kind : null;
}

export function relationLabel(kind: string): string {
  return lookup(relationLabels, kind);
}

export function declarationKind(declaration: SourceDeclaration): string {
  return declaration.meanings.at(0)?.kind ?? declaration.kind;
}

export function declarationLabel(declaration: SourceDeclaration): string {
  return lookup(declarationLabels, declarationKind(declaration));
}

export function setupLabel(setup: SetupItem): string {
  return lookup(setupLabels, setup.kind);
}
