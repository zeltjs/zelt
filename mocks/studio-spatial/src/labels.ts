import type {
  DeclarationKind,
  SetupItem,
  SourceDeclaration,
  SourceRelation,
  TsRelationKind,
} from './snapshot.types';

// The schema's closed unions: a kind added there fails to compile until it is labelled here.
const tsRelationLabels: Record<TsRelationKind, string> = {
  call: '呼ぶ',
  read: '読む / 参照',
  contract: '契約を呼ぶ',
  type: '型参照',
  extends: '継承',
  implements: '実装',
  override: 'override',
  construct: '生成',
};
const declarationKindLabels: Record<DeclarationKind, string> = {
  method: 'METHOD',
  constructor: 'CTOR',
  function: 'FUNCTION',
  callback: 'CALLBACK',
  property: 'PROP',
  getter: 'GET',
  signature: 'SIGNATURE',
  type: 'TYPE',
  value: 'VALUE',
};

// Kinds a plugin grants are open, so no type can cover them; unknown kinds show as-is.
const grantedRelationLabels: ReadonlyMap<string, string> = new Map(
  Object.entries({
    schema: '入力検証schema参照',
    table: 'table参照',
    middleware: 'middleware適用',
    event: 'event配送',
    register: '登録',
  }),
);
const meaningLabels: ReadonlyMap<string, string> = new Map(
  Object.entries({
    schema: 'SCHEMA',
    table: 'TABLE',
    'event-type': 'EVENT TYPE',
  }),
);
// SetupItem.kind is a plain string in the schema, so setup has no closed part at all.
const setupLabels: ReadonlyMap<string, string> = new Map(
  Object.entries({
    inject: '注入',
    middleware: 'middleware指定',
    'config-override': '設定の差し替え',
    lifecycle: 'lifecycle登録',
  }),
);

export const relationKinds: readonly string[] = [
  ...Object.keys(tsRelationLabels),
  ...grantedRelationLabels.keys(),
];

function lookup(
  closed: Readonly<Record<string, string>>,
  open: ReadonlyMap<string, string>,
  kind: string,
): string {
  return closed[kind] ?? open.get(kind) ?? kind;
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
  return lookup(tsRelationLabels, grantedRelationLabels, kind);
}

export function declarationKind(declaration: SourceDeclaration): string {
  return declaration.meanings.at(0)?.kind ?? declaration.kind;
}

export function declarationLabel(declaration: SourceDeclaration): string {
  return lookup(declarationKindLabels, meaningLabels, declarationKind(declaration));
}

export function setupLabel(setup: SetupItem): string {
  return setupLabels.get(setup.kind) ?? setup.kind;
}
