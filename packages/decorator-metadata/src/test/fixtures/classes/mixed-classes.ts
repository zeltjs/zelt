// getClassDeclarations テスト用
import { createClassDecorator } from '../../../index';

const Service = createClassDecorator({ type: 'service' });

class Dep {}

// @UseMiddleware(X) のような、識別子引数を取る decorator factory の args 抽出を確認する
function Wired(_dep: unknown): (cls: unknown) => void {
  return () => {};
}

class UndecoratedInternal {}

@Service
export class ExportedDecorated {
  value = 1;
}

@Service
@Wired(Dep)
class NonExportedMultiDecorated {}

export default class DefaultExported {}

// レビュー指摘6: `export { A as B }` で公開名(B)が宣言名(A)と異なるケース
class AliasedInternal {}

export { AliasedInternal as PublicAlias };

// lint(no-unused-vars)回避のための軽い参照(module-functions.ts の privateFn(1) と同じ手法)
new UndecoratedInternal();
new NonExportedMultiDecorated();
