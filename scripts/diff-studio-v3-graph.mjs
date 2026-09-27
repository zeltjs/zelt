#!/usr/bin/env node
// 2つの v3 DependencyGraph JSON を構造的に(配列順序に依存せず)比較する。
// 比較ロジック自体は packages/cli/src/studio/graph/graph-diff.lib.ts に分離されており、
// このスクリプトは CLI I/O(引数解釈・ファイル読み込み・コンソール出力・終了コード)のみを担う。
// tsdown のエントリポイント(cli.ts/index.ts/config/index.ts/analyzer-entry.ts)に
// graph-diff.lib.ts は含まれないため dist には出力されない(公開バンドルに含める理由が
// ないため、この検証専用の内部モジュールのためだけにエントリポイントを増やさない)。
// Node のネイティブ TypeScript 型剥離(このリポジトリは volta で node 26.1.0 に固定)を使い、
// src の .ts を直接 import する
import { readFileSync } from 'node:fs';

import {
  diffGraphs,
  isActualTestsCountOk,
  isGraphDiffClean,
} from '../packages/cli/src/studio/graph/graph-diff.lib.ts';

// レビュー指摘12: 既定(フラグ無し)は「actual は実抽出結果」を前提にした厳格モード。
// actual.tests が非空なら(第3サブプロジェクトまでスコープ外の設計に反するため)終了コードを
// 非0にする。両辺が手起こしモック同士の自己diff(Task 10 Step 4 の検証手順。モックは
// tests に非空のサンプルを含みうる)だけ --self-diff で明示的にこのチェックを外す
const args = process.argv.slice(2).filter((a) => a !== '--self-diff');
const selfDiff = process.argv.includes('--self-diff');
const [actualPath, expectedPath] = args;
if (!actualPath || !expectedPath) {
  console.error(
    'Usage: node scripts/diff-studio-v3-graph.mjs <actual.json> <expected.json> [--self-diff]',
  );
  process.exit(2);
}

const readJson = (path) => JSON.parse(readFileSync(path, 'utf-8'));
const actual = readJson(actualPath);
const expected = readJson(expectedPath);

const result = diffGraphs(actual, expected);

if (result.versionMismatch !== undefined) {
  console.log(`version mismatch: actual=${result.versionMismatch.actual} expected=${result.versionMismatch.expected}`);
}

// tests 自体は構造比較(diffGraphs の nodes/edges)には含めない(レビュー指摘18:
// 第3サブプロジェクトまでスコープ外)。ただし実抽出結果(actual)の tests が空である
// という不変条件は、--self-diff が指定されていない既定モードでは終了コードに反映する
// (レビュー指摘12: 以前はログに note を出すだけで、実際の抽出結果に対して実行しても
// 常に exit 0 になり得ていた)
console.log(
  `tests: SKIPPED (out of scope until sub-project 3; not compared — actual has ${result.actualTestsCount}, expected has ${(expected.tests ?? []).length} entries)`,
);
const actualTestsOk = selfDiff || isActualTestsCountOk(result);
if (!isActualTestsCountOk(result)) {
  console.log(
    `  ${selfDiff ? 'note' : 'FAIL'}: actual.tests is non-empty (${result.actualTestsCount} entries)${
      selfDiff ? ' — allowed under --self-diff' : ' — must be [] until sub-project 3'
    }`,
  );
}

const nodesClean =
  result.nodes.missing.length === 0 &&
  result.nodes.extra.length === 0 &&
  result.nodes.changed.length === 0 &&
  result.nodeIdDuplicates.length === 0;
console.log(`nodes: ${nodesClean ? 'OK' : 'DIFF FOUND'} (${result.nodes.total} items in actual)`);
if (!nodesClean) {
  if (result.nodeIdDuplicates.length > 0) {
    console.log(`  duplicate node ids (schema violation, not a diff): ${result.nodeIdDuplicates.length}`, result.nodeIdDuplicates);
  }
  if (result.nodes.missing.length > 0) {
    console.log(`  missing (expected but not in actual): ${result.nodes.missing.length}`, result.nodes.missing);
  }
  if (result.nodes.extra.length > 0) {
    console.log(`  extra (in actual but not expected): ${result.nodes.extra.length}`, result.nodes.extra);
  }
  for (const c of result.nodes.changed) {
    console.log(`  changed: ${c.key}`);
    console.log(`    actual:   ${JSON.stringify(c.actual)}`);
    console.log(`    expected: ${JSON.stringify(c.expected)}`);
  }
}

const edgesClean = result.edges.mismatches.length === 0;
console.log(`edges: ${edgesClean ? 'OK' : 'DIFF FOUND'} (${result.edges.total} items in actual)`);
if (!edgesClean) {
  console.log(`  multiplicity mismatches: ${result.edges.mismatches.length}`);
  for (const m of result.edges.mismatches) {
    console.log(`    actual count=${m.actualCount} expected count=${m.expectedCount}: ${m.key}`);
  }
}

process.exit(isGraphDiffClean(result) && actualTestsOk ? 0 : 1);
