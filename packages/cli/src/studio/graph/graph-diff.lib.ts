// v3 DependencyGraph 同士を構造的に(配列順序・オブジェクトのキー順序に依存せず)比較する
// 純粋関数群。CLI I/O(ファイル読み込み・コンソール出力・終了コード)は一切持たない
// (レビュー追加指摘: 自動テストで検証できるよう純粋関数として分離する)。
// scripts/diff-studio-v3-graph.mjs はビルド後の dist からこの lib を import して使う
import type { FunctionContract } from '@zeltjs/decorator-metadata/inspect';

import type { DependencyGraph, GraphEdgeV3, GraphNodeV3 } from './graph.types';

// team-lead 決定(Task 10 remaining-diff cause B): checker.typeToString は匿名オブジェクト
// 型リテラルのメンバーを checker の型解決順で出力するが、この順序は Program(tsconfig の
// include 内容・依存解決順など)ごとに安定しない事実であり、どちらの並びが「正しい」という
// ことはない。そのため抽出器側を直さず、比較側でメンバー順序を正規化する。
// `{ name: type; ... }` の直下メンバーだけを対象にプロパティ名でアルファベット順に並べ替える
// (ネストした `{...}` は再帰的に同じ規則を適用する。union `|`・generics `<...>` 自体の並びは
// 一切変更しない)

// segment 先頭の member 名(`readonly` 修飾子・`?` 任意マーカーを除いた識別子部分)を
// ソートキーとして取り出す
const memberSortKeyOf = (segment: string): string => {
  const withoutReadonly = segment.trim().replace(/^readonly\s+/, '');
  const colonIndex = withoutReadonly.indexOf(':');
  const namePart = colonIndex === -1 ? withoutReadonly : withoutReadonly.slice(0, colonIndex);
  return namePart.replace(/\?$/, '').trim();
};

// team-lead 決定(Task 10 review): 文字列リテラル型(例 '{')・テンプレートリテラル型
// (例 `/api/${string}/foo`)の中身は構文(オブジェクト型リテラルの {}・メンバー区切りの ;)
// ではないため、`{`/`}`/`;` の構造判定から除外しなければならない。位置ごとに「リテラルの
// 中(構造とみなさない)か」を判定するマスクを1回のスキャンで作る。テンプレートリテラルの
// `${...}` 補間の中はコードに戻る(補間の中にオブジェクト型リテラルが書かれることもあるため、
// ネストした {} の深さを数えて対応する `}` でだけ補間を終える)
type LiteralFrame = 'single' | 'double' | 'template' | { interpolationDepth: number };

// バックスラッシュ(エスケープ文字)。ソースに生では書かず文字コードから作る
const ESCAPE_CHAR = String.fromCharCode(92);

// 単純な引用符('...')/ダブルクォート("...")の「中」を1文字進める。次に見るべき index を
// 返す(mask/stack は破壊的に更新する)
const advanceInsideSingleOrDoubleQuote = (
  str: string,
  i: number,
  frame: 'single' | 'double',
  mask: boolean[],
  stack: LiteralFrame[],
): number => {
  mask[i] = true;
  const ch = str[i];
  if (ch === ESCAPE_CHAR) {
    if (i + 1 < str.length) mask[i + 1] = true;
    return i + 2;
  }
  const closingQuote = frame === 'single' ? "'" : '"';
  if (ch === closingQuote) stack.pop();
  return i + 1;
};

// テンプレートリテラル(`...`)の「中」を1文字進める。`${` で補間フレームを開始する
const advanceInsideTemplateLiteral = (
  str: string,
  i: number,
  mask: boolean[],
  stack: LiteralFrame[],
): number => {
  mask[i] = true;
  const ch = str[i];
  if (ch === ESCAPE_CHAR) {
    if (i + 1 < str.length) mask[i + 1] = true;
    return i + 2;
  }
  if (ch === '`') {
    stack.pop();
    return i + 1;
  }
  if (ch === '$' && str[i + 1] === '{') {
    mask[i + 1] = true;
    stack.push({ interpolationDepth: 0 });
    return i + 2;
  }
  return i + 1;
};

// テンプレートリテラルの `${...}` 補間の中(コード扱い)を1文字進める。ネストした {} は
// 補間自体の終端 `}` と区別するために深さを数え、対応する `}` でだけ補間を終える。
// レビュー指摘7: 補間を終端する `}` 自身はテンプレートリテラル構文の一部(オブジェクト型
// リテラルの `}` ではない)であり、mask せずに outer の構造判定(splitTopLevelMembers の
// depth カウント)に晒すと、そこで depth が余分に1つ減ってしまい、以降の `;` がどのメンバーにも
// 属さないまま構造比較が壊れる(実測: `{ a: \`x${string}y\`; b: number; }` で b が消える)。
// 補間の中身(`{` を含む)自体はコード式であり mask しない(ネストした `{}` は
// interpolationDepth で対応を取るだけで、外側の構造判定には元々関与させる設計のため)
const advanceInsideInterpolation = (
  str: string,
  i: number,
  frame: { interpolationDepth: number },
  stack: LiteralFrame[],
  mask: boolean[],
): number => {
  const ch = str[i];
  if (ch === '{') {
    frame.interpolationDepth++;
    return i + 1;
  }
  if (ch === '}') {
    if (frame.interpolationDepth === 0) {
      mask[i] = true; // 補間の終端 `}`。テンプレートリテラル状態に戻る
      stack.pop();
    } else {
      frame.interpolationDepth--;
    }
    return i + 1;
  }
  return i + 1;
};

// コード扱いの位置(トップレベル、または補間の中)で引用符/テンプレートリテラルが
// 開始するかどうかを見て、開始するならフレームを積む
const maybeOpenLiteral = (ch: string, stack: LiteralFrame[]): void => {
  if (ch === "'") stack.push('single');
  else if (ch === '"') stack.push('double');
  else if (ch === '`') stack.push('template');
};

const computeLiteralMask = (str: string): readonly boolean[] => {
  const mask = new Array<boolean>(str.length).fill(false);
  const stack: LiteralFrame[] = [];
  let i = 0;
  while (i < str.length) {
    const top = stack[stack.length - 1];
    if (top === 'single' || top === 'double') {
      i = advanceInsideSingleOrDoubleQuote(str, i, top, mask, stack);
      continue;
    }
    if (top === 'template') {
      i = advanceInsideTemplateLiteral(str, i, mask, stack);
      continue;
    }
    if (typeof top === 'object') {
      i = advanceInsideInterpolation(str, i, top, stack, mask);
      continue;
    }
    maybeOpenLiteral(str[i] ?? '', stack);
    i++;
  }
  return mask;
};

type SplitState = {
  readonly depth: number;
  readonly start: number;
  readonly members: readonly string[];
};

// splitTopLevelMembers の1文字分の状態遷移(mask で除外された位置は素通しする)
const advanceSplitState = (
  body: string,
  i: number,
  mask: readonly boolean[],
  state: SplitState,
): SplitState => {
  if (mask[i]) return state;
  const ch = body[i];
  if (ch === '{') return { ...state, depth: state.depth + 1 };
  if (ch === '}') return { ...state, depth: state.depth - 1 };
  if (ch === ';' && state.depth === 0) {
    return {
      depth: state.depth,
      start: i + 1,
      members: [...state.members, body.slice(state.start, i)],
    };
  }
  return state;
};

// object type literal の中身(`{`と`}`の間)を、直下の `;` 区切りメンバーに分割する。
// TypeScript の型構文では `;` はオブジェクト型リテラルのメンバー区切りにしか現れない
// (generics `<...>`/tuple `[...]` の要素区切りは `,`)ため、ネストした `{}` の深さだけを
// 追跡すれば直下メンバーの境界を正しく判定できる(文字列/テンプレートリテラルの中の
// `{`/`}`/`;` は computeLiteralMask で除外する)
const splitTopLevelMembers = (body: string): readonly string[] => {
  const mask = computeLiteralMask(body);
  let state: SplitState = { depth: 0, start: 0, members: [] };
  for (let i = 0; i < body.length; i++) {
    state = advanceSplitState(body, i, mask, state);
  }
  const tail = body.slice(state.start).trim();
  return tail.length > 0 ? [...state.members, tail] : state.members;
};

// `typeStr[openIndex]` が(リテラルの中ではない)`{` である前提で、対応する `}` の
// 直後の位置を返す(ネストした `{}` の深さを追跡して対応を取る。文字列/テンプレート
// リテラルの中の `{`/`}` は computeLiteralMask で除外する)
const matchingBraceEndOf = (typeStr: string, openIndex: number): number => {
  const mask = computeLiteralMask(typeStr);
  let depth = 1;
  let j = openIndex + 1;
  while (j < typeStr.length && depth > 0) {
    if (!mask[j]) {
      if (typeStr[j] === '{') depth++;
      else if (typeStr[j] === '}') depth--;
    }
    j++;
  }
  return j;
};

// `{`/`}` の中身(inner)を直下メンバーに分解し、名前でソートして再構築する
// (各メンバーの type 部分自体がネストした `{...}` を持ちうるため再帰的に正規化する)
const canonicalizeBraceContent = (inner: string): string => {
  const members = splitTopLevelMembers(inner)
    .map((m) => m.trim())
    .filter((m) => m.length > 0)
    .map((m) => canonicalizeTypeLiteralOrder(m));
  const sorted = [...members].sort((a, b) => {
    const aKey = memberSortKeyOf(a);
    const bKey = memberSortKeyOf(b);
    return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
  });
  return sorted.length === 0 ? '{}' : `{ ${sorted.map((m) => `${m};`).join(' ')} }`;
};

// 型文字列中の `{...}` を(ネストも含めて)再帰的に見つけ、それぞれの直下メンバーを
// アルファベット順に並べ替える。`{`/`}` 以外の文字(union・generics の記号を含む)は
// そのまま素通しする。文字列/テンプレートリテラルの中の `{` はオブジェクト型リテラルの
// 開始とみなさない(computeLiteralMask で判定する)
export const canonicalizeTypeLiteralOrder = (typeStr: string): string => {
  const mask = computeLiteralMask(typeStr);
  let result = '';
  let i = 0;
  while (i < typeStr.length) {
    const ch = typeStr[i];
    if (ch !== '{' || mask[i]) {
      result += ch;
      i++;
      continue;
    }
    const j = matchingBraceEndOf(typeStr, i);
    result += canonicalizeBraceContent(typeStr.slice(i + 1, j - 1));
    i = j;
  }
  return result;
};

// GraphNodeV3 が FnNode(`.contract` を持つ)の場合のみ、その params[].type/returnType の
// 型リテラルメンバー順序を正規化した「比較専用」のコピーを返す。ClassNode/ExternalNode は
// contract を持たないためそのまま返す。戻り値は比較(canonicalStringify)にのみ使い、
// diff 結果に載せる actual/expected は元のノードのまま(正規化前の実際の文字列を表示する)
const canonicalizeContractOf = (node: GraphNodeV3): unknown => {
  // `id` は GraphNodeV3 の全 variant(FnNode/ClassNode/ExternalNode)に共通するフィールドで、
  // これが無いと `contract` しか持たないこの構造的型は ClassNode/ExternalNode と
  // 共通プロパティを1つも持たなくなり、代入できなくなる(TS の弱い型の判定)
  const record: { readonly id?: string; contract?: FunctionContract } = node;
  if (record.contract === undefined) return node;
  return {
    ...node,
    contract: {
      params: record.contract.params.map((p) => ({
        ...p,
        type: canonicalizeTypeLiteralOrder(p.type),
      })),
      returnType: canonicalizeTypeLiteralOrder(record.contract.returnType),
    },
  };
};

// JSON.stringify はオブジェクトのキー挿入順序に依存するため、キー順序だけが異なる同値な
// オブジェクト同士を誤って「変更あり」と報告しうる。キーを再帰的にソートしてから stringify
// する(配列の要素順序自体は意味を持つ場合があるため並べ替えない。例: FnNode.decorators は
// クラス decorator → メソッド decorator の宣言順が意味を持つ)
export const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    // `object` narrowing above doesn't give index access, so Object.entries (not a cast)
    // is used to read key/value pairs without an `as` assertion
    const sortedEntries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return Object.fromEntries(sortedEntries.map(([k, v]) => [k, canonicalize(v)]));
  }
  return value;
};
export const canonicalStringify = (value: unknown): string => JSON.stringify(canonicalize(value));

export type NodeDiffResult = {
  readonly missing: readonly string[];
  readonly extra: readonly string[];
  readonly changed: readonly {
    readonly key: string;
    readonly actual: GraphNodeV3;
    readonly expected: GraphNodeV3;
  }[];
  readonly total: number;
};

// nodes: id を一意キーとする集合比較。id の一意性チェックは duplicateNodeIds に分離する
// (「actual と expected の差分」と「1つのグラフ単体のスキーマ違反」は別の関心事)
export const diffNodes = (
  actualNodes: readonly GraphNodeV3[],
  expectedNodes: readonly GraphNodeV3[],
): NodeDiffResult => {
  const actualMap = new Map(actualNodes.map((n) => [n.id, n]));
  const expectedMap = new Map(expectedNodes.map((n) => [n.id, n]));
  const missing = [...expectedMap.keys()].filter((k) => !actualMap.has(k));
  const extra = [...actualMap.keys()].filter((k) => !expectedMap.has(k));
  const changed = [...expectedMap.entries()].flatMap(([key, expectedNode]) => {
    const actualNode = actualMap.get(key);
    if (actualNode === undefined) return [];
    // team-lead 決定(cause B): 比較そのものは contract 文字列の型リテラルメンバー順序を
    // 正規化したコピーで行う(actual/expected として結果に載せるのは元のノードのまま)
    return canonicalStringify(canonicalizeContractOf(actualNode)) ===
      canonicalStringify(canonicalizeContractOf(expectedNode))
      ? []
      : [{ key, actual: actualNode, expected: expectedNode }];
  });
  return { missing, extra, changed, total: actualNodes.length };
};

export type DuplicateIdEntry = {
  readonly side: 'actual' | 'expected';
  readonly id: string;
  readonly count: number;
};

// ノード id はスキーマ上一意でなければならない(DUPLICATE_NODE_ID として fail する設計)。
// これは actual/expected の「差分」ではなく、それぞれのファイル単体が満たすべき制約の検証
export const duplicateNodeIds = (
  nodes: readonly GraphNodeV3[],
  side: 'actual' | 'expected',
): readonly DuplicateIdEntry[] => {
  const counts = new Map<string, number>();
  for (const n of nodes) counts.set(n.id, (counts.get(n.id) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([id, count]) => ({ side, id, count }));
};

export type EdgeMultiplicityMismatch = {
  readonly key: string;
  readonly actualCount: number;
  readonly expectedCount: number;
};
export type EdgeDiffResult = {
  readonly mismatches: readonly EdgeMultiplicityMismatch[];
  readonly total: number;
};

const multisetCounts = (items: readonly unknown[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = canonicalStringify(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
};

// edges: (from,to,kind,line) のような部分キーではなく、辺オブジェクト全体の
// canonicalStringify をキーにしたマルチセットとして両側の「出現回数」を比較する。
// 同一行・別列の複数呼び出しが同じ宛先を指す正当なケース(実例: ec-backend の
// OrderService.findByUser → ext:drizzle-orm#desc が L91 に2本)を、部分キーのグルーピングで
// 誤って「重複」と報告しないための設計(レビュー再指摘: multiset比較の訂正)
export const diffEdgesByMultiset = (
  actualEdges: readonly GraphEdgeV3[],
  expectedEdges: readonly GraphEdgeV3[],
): EdgeDiffResult => {
  const actualCounts = multisetCounts(actualEdges);
  const expectedCounts = multisetCounts(expectedEdges);
  const allKeys = new Set([...actualCounts.keys(), ...expectedCounts.keys()]);
  const mismatches = [...allKeys]
    .map((key) => ({
      key,
      actualCount: actualCounts.get(key) ?? 0,
      expectedCount: expectedCounts.get(key) ?? 0,
    }))
    .filter(({ actualCount, expectedCount }) => actualCount !== expectedCount);
  return { mismatches, total: actualEdges.length };
};

export type GraphDiffResult = {
  readonly versionMismatch: { readonly actual: number; readonly expected: number } | undefined;
  readonly nodes: NodeDiffResult;
  readonly nodeIdDuplicates: readonly DuplicateIdEntry[];
  readonly edges: EdgeDiffResult;
  // tests 配列自体は比較対象外(第3サブプロジェクトまでスコープ外の設計。レビュー指摘18)。
  // nodes/edges の構造比較には含めないが、フィールドとして持たせておき呼び出し側が
  // 別途「実際の抽出結果の tests が空であること」を検証できるようにする
  readonly actualTestsCount: number;
};

export const diffGraphs = (
  actual: DependencyGraph,
  expected: DependencyGraph,
): GraphDiffResult => ({
  versionMismatch:
    actual.version === expected.version
      ? undefined
      : { actual: actual.version, expected: expected.version },
  nodes: diffNodes(actual.nodes, expected.nodes),
  nodeIdDuplicates: [
    ...duplicateNodeIds(actual.nodes, 'actual'),
    ...duplicateNodeIds(expected.nodes, 'expected'),
  ],
  edges: diffEdgesByMultiset(actual.edges, expected.edges),
  actualTestsCount: actual.tests.length,
});

// 構造比較(version/nodes/edges)のみの判定。tests の中身は元々比較対象外であり、
// actualTestsCount をここに含めない(「2つのグラフの構造は一致するか」という汎用的な
// 問いと、「この actual は tests 未実装という前提を満たしているか」という Task 10 固有の
// 不変条件は別の関心事のため。後者は isActualTestsCountOk で別途判定する)
export const isGraphDiffClean = (result: GraphDiffResult): boolean =>
  result.versionMismatch === undefined &&
  result.nodes.missing.length === 0 &&
  result.nodes.extra.length === 0 &&
  result.nodes.changed.length === 0 &&
  result.nodeIdDuplicates.length === 0 &&
  result.edges.mismatches.length === 0;

// レビュー追加指摘(e): 「実際の抽出結果の tests が [] であること」自体の検証。
// mock 同士の自己diff(Task 10 Step 4)のように両辺が手起こしモックの場合は
// actualTestsCount が非ゼロになりうるため、この判定は isGraphDiffClean に混ぜず、
// 実抽出結果を検証する呼び出し側(Task 10 Step 7)だけが使う
export const isActualTestsCountOk = (result: GraphDiffResult): boolean =>
  result.actualTestsCount === 0;
