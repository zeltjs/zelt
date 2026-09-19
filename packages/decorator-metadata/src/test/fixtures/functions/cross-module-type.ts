// getFunctionSignature の typeToString enclosingDeclaration テスト用(Task 10
// remaining-diff cause 7)。ec-backend の createEcApp と同じ形: 戻り値の型(Ok<...>)を
// 構成するクラス自体はこのファイルにインポートされておらず(インポートしているのは
// 関数 ok のみ)、型は純粋に推論されている。この「型名がこのファイルのスコープから
// 直接参照可能ではない」状態でのみ、enclosingDeclaration の有無で import("pkg") 修飾の
// 有無が変わる(Ok 自体を import していれば、そのままの名前で参照可能なため
// enclosingDeclaration の有無に関わらず修飾は付かない。最初の実装時の見落とし)
import { ok } from 'neverthrow';

export function makeOk(value: string) {
  return ok<string, never>(value);
}
