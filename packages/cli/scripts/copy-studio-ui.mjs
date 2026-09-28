// @zeltjs/cli は npm に公開されるが studio-ui は private workspace なので、
// build のたびに vite の成果物を dist へ取り込んで「cli だけで画面が開く」状態を保つ。
// 成果物が無ければ access が ENOENT で落ちる (UI の無い cli を publish させない)
import { access, cp } from 'node:fs/promises';

const source = new URL('../../studio-ui/dist/', import.meta.url);
const destination = new URL('../dist/studio-ui/', import.meta.url);

await access(new URL('index.html', source));
await cp(source, destination, { recursive: true });
