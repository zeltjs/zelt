// 同じ decorator ファクトリ(marker.lib.ts の Marker/ClassMarker)を同じメソッド/クラスに
// 複数回適用したとき、各適用の位置が最初の1件に collapse されず個別に解決されることを
// 検証するための fixture(getDecoratorApplicationPosition のテストが使う)
import { ClassMarker, Marker } from './marker.lib';

@ClassMarker('first')
@ClassMarker('second')
export class Sample {
  /** @throws {E} */
  @Marker('first')
  @Marker('second')
  method(): void {}
}
