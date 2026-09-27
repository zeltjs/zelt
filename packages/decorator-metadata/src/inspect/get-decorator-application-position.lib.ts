import { getInternalClassMetadata } from '../runtime/index';
import type { Position } from './position.lib';
import { resolvePosition } from './position.lib';

export type DecoratorApplicationTarget =
  | { kind: 'class' }
  | { kind: 'method'; readonly name: string | symbol };

// 特定の decorator "適用"(クラス全体、またはメソッド1つ)が実際にソース上どこに
// 書かれたかを、AST ではなく実行時に記録された stack trace(define trace)から解決する。
// `@RateLimit({...})` (内部で `UseMiddleware(RateLimitMiddleware, opts)` を呼ぶだけの
// decorator ファクトリ)のように、decorator の名前が呼び出し先の名前と一致しない
// ラッパーであっても、decorator "式" が評価される場所(TC39 は decorator 式を宣言順に
// 評価する)は常にユーザーが書いたソース上の行になる。resolvePosition の define trace
// (StackTrace.error)は「ファクトリを呼び出した行」まで正しく遡れるため、この式評価位置を
// 指す(呼び出し元の判別共用体の分岐と同じ理由で call trace ではなく define trace を使う。
// call trace は TC39 decorator 適用機構(esbuild の lowering ヘルパー等)を multiple frames
// 経由するため、Error.stackTraceLimit の既定値内に本来のユーザーフレームが収まらないことが
// あり実運用で信頼できない。define trace は「ファクトリを直接呼んだフレーム」の1つ上を
// 見るだけで済むため短く安定する)。ファクトリ自身のファイルが呼び出し元と別ファイルであれば
// resolvePosition 自身の wrapper-diff(define/call の差分でラッパーファイルを検出する既存機構)
// がファクトリのファイルを機構として除外し、正しくユーザーの呼び出し行まで辿り着く
//
// 既知の制約(trace.lib.ts:captureStackTrace 参照): define trace も無制限ではなく、
// `Error.stackTraceLimit`(既定 10)にフレーム数が切り詰められる。`@RateLimit` のような
// 1段ラップの decorator ファクトリは数フレームで済むため実運用で問題にならないが、
// ファクトリが更に別のファクトリをラップするような2段以上のラップだと、本来のユーザー
// フレームに達する前に上限に達し `resolvePosition` が undefined を返すことがある。
// その場合この関数も undefined を返し、呼び出し元(build-graph.lib.ts の
// appliedMiddlewareLine)は AST の literal `@UseMiddleware(X)` 一致にフォールバックし、
// それも見つからなければ最終手段として DECLARATION_NOT_FOUND で fail する(黙って
// line: 0 にフォールバックしない、という既存の握り潰さない方針のまま)。
// `Error.stackTraceLimit` 自体を変更することでは対処しない(共有基盤である
// decorator-metadata の他の利用箇所への副作用を避けるため)
export const getDecoratorApplicationPosition = (
  cls: object,
  target: DecoratorApplicationTarget,
  matchesProps: (props: object) => boolean,
): Position | undefined => {
  const internal = getInternalClassMetadata(cls);
  if (internal === undefined) return undefined;
  const holder =
    target.kind === 'class' ? internal : internal.methods.find((m) => m.name === target.name);
  if (holder === undefined) return undefined;
  const index = holder.props.findIndex(matchesProps);
  if (index === -1) return undefined;
  return resolvePosition(holder.propTraces[index]);
};
