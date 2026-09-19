import type { CallContext } from './inspect.types';

type TypeScriptModule = typeof import('typescript');
type TSNode = import('typescript').Node;

const catchContextOf = (parent: TSNode, ts: TypeScriptModule): CallContext | undefined =>
  ts.isCatchClause(parent) ? 'catch' : undefined;

const tryOrFinallyContextOf = (
  current: TSNode,
  parent: TSNode,
  ts: TypeScriptModule,
): CallContext | undefined => {
  if (!ts.isTryStatement(parent)) return undefined;
  if (current === parent.tryBlock) return 'try';
  if (current === parent.finallyBlock) return 'finally';
  return undefined;
};

const branchContextOf = (
  current: TSNode,
  parent: TSNode,
  ts: TypeScriptModule,
): CallContext | undefined => {
  if (
    ts.isIfStatement(parent) &&
    (current === parent.thenStatement || current === parent.elseStatement)
  ) {
    return 'branch';
  }
  if (
    ts.isConditionalExpression(parent) &&
    (current === parent.whenTrue || current === parent.whenFalse)
  ) {
    return 'branch';
  }
  if (ts.isCaseClause(parent) || ts.isDefaultClause(parent)) return 'branch';
  return undefined;
};

const loopContextOf = (parent: TSNode, ts: TypeScriptModule): CallContext | undefined =>
  ts.isForStatement(parent) ||
  ts.isForInStatement(parent) ||
  ts.isForOfStatement(parent) ||
  ts.isWhileStatement(parent) ||
  ts.isDoStatement(parent)
    ? 'loop'
    : undefined;

const callbackContextOf = (
  current: TSNode,
  parent: TSNode,
  ts: TypeScriptModule,
): CallContext | undefined =>
  (ts.isFunctionExpression(parent) || ts.isArrowFunction(parent)) && current === parent.body
    ? 'callback'
    : undefined;

// 1階層分(current の直接の親)だけを見て、直近(最内)の構造に一致すれば文脈を1つ返す。
// 判定順序自体に優先度は無い(同じ parent が複数の構造に同時該当することは無いため)
const contextOfStep = (
  current: TSNode,
  parent: TSNode,
  ts: TypeScriptModule,
): CallContext | undefined =>
  catchContextOf(parent, ts) ??
  tryOrFinallyContextOf(current, parent, ts) ??
  branchContextOf(current, parent, ts) ??
  loopContextOf(parent, ts) ??
  callbackContextOf(current, parent, ts);

// CallExpression/NewExpression/TaggedTemplateExpression から親方向へ辿り、直近(最内)の
// 構造で文脈を1つに決める(spec 5(d))。boundary(その呼び出しを含む FnNode 自身の
// 宣言ノード)に達するまでに何にも一致しなければ 'plain'
export const classifyCallContext = (
  node: TSNode,
  ts: TypeScriptModule,
  boundary: TSNode,
): CallContext => {
  let current: TSNode = node;
  while (current !== boundary) {
    const parent = current.parent;
    const found = contextOfStep(current, parent, ts);
    if (found !== undefined) return found;
    current = parent;
  }
  return 'plain';
};
