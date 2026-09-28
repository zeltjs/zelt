// 旧 studio analyzer(packages/cli)がこの app を子プロセスで読むためだけの設定。
// fixture 本体を二重に置かないため、cli 側からこのディレクトリを参照している
import { defineConfig } from '../../../cli/src/config/index';

export default defineConfig({
  app: () => import('./src/app').then((m) => m.app),
});
