import { describe, expect, it } from 'vitest';
import type { DependencyGraph, GraphEdgeV3, GraphNodeV3 } from './graph.types';
import {
  canonicalizeTypeLiteralOrder,
  diffEdgesByMultiset,
  diffGraphs,
  diffNodes,
  isActualTestsCountOk,
  isGraphDiffClean,
} from './graph-diff.lib';

const fn = (id: string, extra: Record<string, unknown> = {}): GraphNodeV3 =>
  ({
    id,
    name: id,
    filePath: 'src/a.ts',
    module: 'src',
    fileKind: null,
    decorators: [],
    contract: { params: [], returnType: 'void' },
    visibility: 'public',
    loc: { start: 1, end: 2 },
    ...extra,
  }) as GraphNodeV3;

const callsEdge = (from: string, to: string, line: number): GraphEdgeV3 =>
  ({ kind: 'calls', from, to, context: 'plain', awaited: false, line }) as GraphEdgeV3;

describe('graph-diff.lib', () => {
  it('(a) 配列順序が違っても一致する', () => {
    const a = fn('a');
    const b = fn('b');
    const result = diffNodes([a, b], [b, a]);
    expect(result.missing).toEqual([]);
    expect(result.extra).toEqual([]);
    expect(result.changed).toEqual([]);
  });

  it('(b) オブジェクトのキー順が違っても一致する', () => {
    const actual = { id: 'x', name: 'x', kind: 'class' } as unknown as GraphNodeV3;
    const expected = { kind: 'class', name: 'x', id: 'x' } as unknown as GraphNodeV3;
    const result = diffNodes([actual], [expected]);
    expect(result.changed).toEqual([]);
  });

  it('(c) 同一要素2件対2件は一致する', () => {
    const edge = callsEdge('src/a.ts#a', 'ext:pkg#member', 10);
    const result = diffEdgesByMultiset([edge, edge], [edge, edge]);
    expect(result.mismatches).toEqual([]);
  });

  it('(d) 2件対1件は多重度不一致として失敗する', () => {
    const edge = callsEdge('src/a.ts#a', 'ext:pkg#member', 10);
    const result = diffEdgesByMultiset([edge, edge], [edge]);
    expect(result.mismatches).toHaveLength(1);
    expect(result.mismatches[0]).toMatchObject({ actualCount: 2, expectedCount: 1 });
  });

  it('(e) tests 配列は比較から除外され、actual.tests が空でない場合は isActualTestsCountOk が失敗を返す', () => {
    const node = fn('a');
    const actual = {
      version: 3,
      nodes: [node],
      edges: [],
      tests: [{ id: 't1' }],
    } as unknown as DependencyGraph;
    const expected = {
      version: 3,
      nodes: [node],
      edges: [],
      tests: [],
    } as unknown as DependencyGraph;
    const result = diffGraphs(actual, expected);
    // nodes/edges 自体には差分が無いことを確認する(tests の中身自体は比較していない証拠)。
    // isGraphDiffClean(構造比較のみ)は tests を見ないため true のままでよい
    expect(result.nodes.missing).toEqual([]);
    expect(result.nodes.extra).toEqual([]);
    expect(result.edges.mismatches).toEqual([]);
    expect(isGraphDiffClean(result)).toBe(true);
    // 一方、「実際の抽出結果の tests が [] であること」という別の不変条件は
    // isActualTestsCountOk が個別に判定し、ここでは非ゼロなので失敗する
    expect(result.actualTestsCount).toBe(1);
    expect(isActualTestsCountOk(result)).toBe(false);
  });

  // team-lead 決定(cause B): checker.typeToString が匿名オブジェクト型リテラルの
  // メンバーを出す順序は Program ごとに安定しないため、比較側でメンバー順序を正規化する
  describe('canonicalizeTypeLiteralOrder (cause B: contract 文字列の型リテラルメンバー順序の正規化)', () => {
    it('sorts top-level members of a single type literal alphabetically', () => {
      expect(canonicalizeTypeLiteralOrder('{ b: string; a: number; }')).toBe(
        canonicalizeTypeLiteralOrder('{ a: number; b: string; }'),
      );
    });

    it('recursively sorts nested type literals independently of the outer member order', () => {
      const x = '{ items: { price: number; id: number; }[]; total: number; }';
      const y = '{ total: number; items: { id: number; price: number; }[]; }';
      expect(canonicalizeTypeLiteralOrder(x)).toBe(canonicalizeTypeLiteralOrder(y));
    });

    it('leaves generics/unions themselves untouched (only sorts each { ... } segment)', () => {
      // Promise<...> の外側の並び・union の項の並びには一切触れない。中の type literal
      // だけが正規化されることを、同じ中身を異なる member 順で書いた2つの文字列が
      // 同じ結果になることで確認する
      const x = 'Promise<{ b: string; a: number; }> | { d: boolean; c: number; }';
      const y = 'Promise<{ a: number; b: string; }> | { c: number; d: boolean; }';
      expect(canonicalizeTypeLiteralOrder(x)).toBe(canonicalizeTypeLiteralOrder(y));
    });

    it('does not falsely equate different member sets', () => {
      expect(canonicalizeTypeLiteralOrder('{ a: number; b: string; }')).not.toBe(
        canonicalizeTypeLiteralOrder('{ a: number; c: string; }'),
      );
    });

    // team-lead 決定(review): 文字列リテラル型・テンプレートリテラル型の中の
    // {}/;/`/'/" は構造とみなしてはいけない(computeLiteralMask で除外する)
    it('leaves a template literal type untouched (its ${...} is not an object type literal)', () => {
      const templateLiteralType = '`/api/${string}/foo`';
      expect(canonicalizeTypeLiteralOrder(templateLiteralType)).toBe(templateLiteralType);
    });

    it('does not treat a brace inside a string literal type as an object type literal boundary', () => {
      const result = canonicalizeTypeLiteralOrder("{ tag: '{'; name: string; }");
      // メンバーは name → tag の順(アルファベット順)に並び替わるが、文字列リテラル型
      // '{' 自体はそのまま残る(パースを壊して壊れた出力になっていないことを確認する)
      expect(result).toBe("{ name: string; tag: '{'; }");
    });

    it('still recursively sorts a nested type literal that sits next to a string literal type member', () => {
      const x = "{ label: '{'; inner: { b: string; a: number; }; }";
      const y = "{ inner: { a: number; b: string; }; label: '{'; }";
      expect(canonicalizeTypeLiteralOrder(x)).toBe(canonicalizeTypeLiteralOrder(y));
    });

    // レビュー指摘7: `${...}` 補間の終端 `}` を mask し忘れると、その `}` が outer の
    // 構造判定(splitTopLevelMembers の depth カウント)を1つ余分に減らし、以降のメンバー
    // (この例では b)が正しく分割されなくなる(depth が 0 に戻らず `;` が member 境界と
    // 認識されない)。テンプレートリテラル自体は壊さずに保ったまま、b がちゃんと
    // 独立したメンバーとして並び替え対象になることを確認する
    it('masks the closing `}` of a template literal interpolation so a member after it is not swallowed', () => {
      const result = canonicalizeTypeLiteralOrder('{ a: `x${string}y`; b: number; }');
      expect(result).toBe('{ a: `x${string}y`; b: number; }');
    });

    it('keeps a member correctly split off after an interpolation even when the member order needs sorting', () => {
      const x = '{ z: `x${string}y`; a: number; }';
      const y = '{ a: number; z: `x${string}y`; }';
      expect(canonicalizeTypeLiteralOrder(x)).toBe(canonicalizeTypeLiteralOrder(y));
      expect(canonicalizeTypeLiteralOrder(x)).toBe('{ a: number; z: `x${string}y`; }');
    });
  });

  it('(f) contract.returnType の型リテラルのメンバー順序が違うだけの FnNode は一致する', () => {
    const actual = fn('a', {
      contract: {
        params: [],
        returnType:
          '{ items: { name: string; id: number; description: string; }[]; total: number; }',
      },
    });
    const expected = fn('a', {
      contract: {
        params: [],
        returnType:
          '{ items: { id: number; name: string; description: string; }[]; total: number; }',
      },
    });
    const result = diffNodes([actual], [expected]);
    expect(result.changed).toEqual([]);
  });

  it('(g) contract.returnType のメンバーの集合自体が違う FnNode は依然として changed になる', () => {
    const actual = fn('a', { contract: { params: [], returnType: '{ a: number; b: string; }' } });
    const expected = fn('a', { contract: { params: [], returnType: '{ a: number; c: string; }' } });
    const result = diffNodes([actual], [expected]);
    expect(result.changed).toHaveLength(1);
  });
});
