import type { DeclarationKind, RelationKind } from './snapshot.types';

export const relationLabels: Record<RelationKind, string> = {
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
  returns: '関数を返す',
  construct: '生成',
};
export const declarationLabels: Record<DeclarationKind, string> = {
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
};
