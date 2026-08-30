import { createClassDecorator } from '../../../index';

// @zeltjs/core の @Middleware 相当: factory を介さず createClassDecorator の結果を
// モジュール読み込み時に一度だけ生成し、直接 export する。define トレースはこの
// モジュールの評価時に捕捉されるため、適用先クラスの定義ファイルを含まない
export const DirectDecorator = createClassDecorator({ type: 'direct' });
