# zelt studio: Node Inspector + Edge Kinds (DependencyGraph v2)

- Date: 2026-07-12
- Status: approved
- Branch: `studio-inspector-edge-kinds` (stacked on `studio-node-grouping`)

## Goal

zelt studio を「visualize <-> code with AI」構想へ進める第一歩として、グラフの表現力を上げる:

1. **ノードインスペクタ** — ノードをクリックして詳細（decorators / routes / 契約シグネチャ等)を確認できる
2. **エッジ種別** — 全エッジが無名の inject 依存である現状から、関係の種類を区別できるスキーマへ

両者を `DependencyGraph` version 2 として一度のスキーマ破壊的変更で導入する。
グラフ JSON は AI 対話→実装適用パイプラインの一級成果物であり、v2 の契約(シグネチャ)は
将来の「理想グラフとの構造 diff」の基礎になる。

## Non-Goals

- **error-handler の適用関係**: `http({ errorHandlers: [...] })` という feature 登録引数にしか
  存在せず、feature 粒度の関係でクラスグラフと粒度が合わない。表現方法は別途設計する
- **`http({ middlewares: [...] })` のグローバル適用**: 同上（feature 粒度）。エッジになるのは
  `@UseMiddleware` デコレータ由来のみ
- **エディタで開く連携**（インスペクタの filePath からのジャンプ）: YAGNI
- **凡例 UI**: エッジの CSS 描き分けで足りるか使ってから判断
- **v1 JSON との後方互換**: UI とサーバーは同梱で常に同期。export 消費者は `version` で判別

## Decisions (経緯)

- 契約(public メソッドシグネチャ)を v2 に含める。version bump を 1 回にする（ユーザー判断）
- 抽出はハイブリッド: routes / middleware 適用 = runtime metadata（props の構造的 match）、
  契約 = `decorator-metadata/inspect` の新静的プリミティブ（ユーザー判断）
- cli は core を runtime import しない既存境界を維持する。analyzer はユーザープロジェクト内で
  動くため、ユーザーの core とのバージョン不一致リスクがある。core が props に書き込む形式
  （`{decorator:'Route', method, path}` 等）を構造的 match で読む
- 型の表現は TypeInfo 木ではなく `checker.typeToString` の文字列。インスペクタ表示・構造 diff・
  AI 可読のいずれも文字列で足りる（YAGNI）

## 1. Schema v2 (`packages/cli/src/studio/graph/graph.types.ts`)

```ts
export type GraphEdgeKind = 'injects' | 'applies-middleware';

export type GraphEdge = {
  readonly from: string;
  readonly to: string;
  readonly kind: GraphEdgeKind;
  // applies-middleware かつ method-level 適用のみ: 対象メソッド名。class-level は undefined
  readonly methods?: readonly string[];
};

// path は Controller の basePath 結合済み fullPath
export type RouteInfo = {
  readonly method: string;
  readonly path: string;
  readonly handler: string;
};

export type MethodSignature = {
  readonly name: string;
  readonly params: readonly { readonly name: string; readonly type: string }[];
  // Promise は unwrap しない（diff 用途では宣言どおりが正確）
  readonly returnType: string;
};

export type GraphNode = {
  // 既存フィールド (id/className/filePath/kind/featureKey/unresolved) はそのまま
  readonly decorators?: readonly string[];        // 全クラスデコレータ名
  readonly routes?: readonly RouteInfo[];         // controller のみ
  readonly contract?: readonly MethodSignature[]; // instance public メソッド。external/unresolved は無し
};

export type DependencyGraph = {
  version: 2;
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
};
```

## 2. 契約抽出プリミティブ (`packages/decorator-metadata/src/inspect/`)

`getPublicMethodSignatures(source, { tsconfig })` を新設する。

- 既存の `program-cache.lib` / `ast.lib`（`findClassByName`）を流用
- `classNode.members` から **instance public メソッドのみ**を列挙:
  private / protected / `#name` / static / getter / setter は除外
- `checker.getSignatureFromDeclaration` + `typeToString` でシグネチャ化
- オーバーロード: 宣言された各オーバーロードシグネチャを列挙し、オーバーロードが存在する場合の
  実装シグネチャは除外する（クラスの公開型と一致させる）
- 配置理由: シグネチャ抽出は inspect 層の汎用プリミティブ、成果物組み上げは studio 側
  （レイヤリング合意、2026-07-06）

## 3. analyzer 拡張 (`packages/cli/src/studio/`)

`analyzer.lib.ts` に純関数を追加（core を import せず props を構造的 match）:

- `extractRoutes(meta)`: method props の `{decorator:'Route', method, path}` を
  class props の `{decorator:'Controller', basePath}` と結合して `RouteInfo[]` に
- `extractMiddlewareRefs(meta)`: class props / method props の
  `{decorator:'UseMiddleware', middlewares}` からミドルウェアの**クラス参照**を取得
  （method 側は methodName も保持）

`analyzer-entry.ts` / `build-graph.lib.ts` の拡張:

- `rootFromClass`: `routes` を付与。`@UseMiddleware` のクラス参照は `getClassSource` で
  ClassSource に正準化し、`applies-middleware` エッジと追加ノード候補として返す
- `buildDependencyGraph`: root 由来の追加エッジ/追加ノードを受け取れる形に拡張。
  middleware ノードは BFS キューに投入し、middleware 自身の inject 依存も展開する
  （`featureClasses()` は controller しか返さないため、未 inject の middleware は
  この経路で初めてグラフに載る）
- 全ノードに `contract`（`getPublicMethodSignatures`）と `decorators` を付与
  （decorators は既に `DependencyResolution` まで取得済みだがノードへ落ちていなかった）

## 4. UI (`packages/cli/studio-ui/`)

- **エッジ描き分け**: `graph-to-flow.lib` がエッジに kind を渡し、CSS クラスで
  `injects` = 実線、`applies-middleware` = 破線 + 別色。
  同一ノードペアに kind 違いの2本が並存しうる（inject かつ適用）ため、
  React Flow のエッジ id には kind を含めて一意化する
- **インスペクタ**: ノードクリック → 右サイドパネルに className / kind / filePath /
  featureKey / decorators / routes / contract / unresolved を表示。
  背景クリックか × で閉じる。選択状態はコンポーネント state のみ（永続化しない）
- positions / grouping への影響なし（ノード属性の追加のみ、storage key 変更不要）

## 5. Error Handling

- external ノード（node_modules 等、program 外）→ `contract` なしは正常系
- program 内クラスで契約抽出が失敗 → **throw で fatal**。既存 resolver の方針と同じく
  全体に波及する異常は握り潰さず、analyzer の errorOutput として UI に表示される

## 6. Testing

- `getPublicMethodSignatures`: fixture クラス（public / private / static / getter /
  Promise 戻り値 / オーバーロード）での integration test
- `extractRoutes` / `extractMiddlewareRefs` / `build-graph` のエッジ種別: 純関数 unit test（TDD）
- `studio-app` fixture に `@UseMiddleware` + ルート付き controller を追加し、
  `analyzer.integration.test.ts` を v2 出力で検証
- UI: `graph-to-flow.lib` のエッジ kind マッピング、インスペクタ用 selection lib の unit test
