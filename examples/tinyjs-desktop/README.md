# Zelt × tinyjs desktop example

A native task-list app: add tasks, mark them done, remove them, and update the native window title. The backend uses Zelt DI and HTTP controllers; the renderer uses `tinyFetch` over native IPC. Tasks live in memory for this application run.

Install [tinyjs](https://tinyjs.app/) 0.50.1 or later. On Linux, its launcher needs WebKitGTK 4.1. Node/pnpm are used only to build the application.

From the repository root:

```sh
pnpm install
pnpm --filter @zeltjs/adapter-tinyjs... build
pnpm --filter @examples/tinyjs-desktop dev
```

This example prebundles TypeScript before starting tinyjs. Restart `pnpm dev` after TypeScript changes to rebuild; plain HTML/CSS changes use tinyjs's frontend reload.

Create a distributable app on the target OS:

```sh
pnpm --filter @examples/tinyjs-desktop package
```

On Linux the resulting `dist/zelt-tinyjs-tasks` runs with its accompanying `dist/launcher`. Keep both files together. tinyjs's build embeds the frontend and backend in the application; Node and npm packages are not runtime dependencies.

Source:

- `src/main.ts`: DI, data/services, validation, HTTP routes, native app access
- `src/renderer.ts`: Fetch client and task UI
- `tinyjs.json`: native app configuration
- `tsdown.config.ts`: portable backend and renderer bundles

Real native WebView verification (Linux also needs `xvfb-run` and `dbus-run-session`):

```sh
pnpm --filter @examples/tinyjs-desktop build
TINYJS_BIN=/path/to/tinyjs pnpm verify:tinyjs
TINYJS_BIN=/path/to/tinyjs pnpm verify:tinyjs -- --packaged
```

This launches a native WebView and verifies task CRUD and native window-title control. It uses a temporary copy of the example, leaving your task app and source files intact.

## macOSでの動作確認

この手順は **Mac本体のターミナルとGUI** で実行する。UbuntuでビルドしたLinux用バイナリは使わず、Mac上でビルドする。こちらで実機検証したのはLinuxであり、以下を実行してMacの結果を確認する。

### 1. 環境とソースを用意する

- macOS 15以降。Apple Silicon / Intelの両方がtinyjsの対応対象。
- Node.js（このリポジトリの指定は26.1.0）とpnpm 10.33.0。

[macOS対応と公式インストール手順](https://tinyjs.app/docs.html#install)。

まず環境を記録する。

```sh
sw_vers -productVersion
uname -m
node --version
pnpm --version
```

pnpmが未導入なら、Nodeを導入した環境で次を実行する。

```sh
npm install -g pnpm@10.33.0
```

ソースはGit経由で取得する。確認用ブランチは `t3code/support-txiki-runtime`。

新しいcheckoutを用意する場合：

```sh
git clone --branch t3code/support-txiki-runtime https://github.com/zeltjs/zelt.git zelt-macos-check
cd zelt-macos-check
```

既存のcheckoutを使う場合は、そのリポジトリ内で実行する。

```sh
git fetch origin
git switch t3code/support-txiki-runtime
git pull --ff-only
git status --short --branch
git log -1 --oneline
```

確認対象のcommitを記録し、以降の操作はそのcheckoutのルートで実行する。

### 2. tinyjsと付属txiki.jsを用意する

すでにtinyjsがある場合は `tinyjs version` で確認する。今回の再現用バージョンはtinyjs 0.50.1 / txiki.js 26.6.0。

新規導入する場合：

```sh
curl -fsSL https://tinyjs.app/install | TINYJS_VERSION=v0.50.1 sh
export PATH="$HOME/.local/bin:$PATH"
tinyjs version
```

tinyjsのインストーラは `tinyjs` をPATHへ追加するが、付属の `tjs` はPATHにない場合がある。検証では実行ファイルを明示する。標準のインストール先は `$HOME/.tinyjs`。別の `TINYJS_HOME` に導入した場合はそのパスを使う。

```sh
export TJS_BIN="${TINYJS_HOME:-$HOME/.tinyjs}/bin/tjs"
"$TJS_BIN" --version
```

### 3. Mac用にビルドする

以降は、Gitで取得したリポジトリのルートがカレントディレクトリ。

```sh
pnpm install --frozen-lockfile
pnpm --filter @zeltjs/adapter-tinyjs... build
pnpm --filter @examples/txiki-http --filter @examples/tinyjs-desktop build
```

### 4. 自動検証する

```sh
pnpm verify:txiki
tinyjs version
pnpm verify:tinyjs
```

成功時には次の行が出る。

```text
txiki.js: 25 native bridge calls, 25 TCP requests, binary/error responses, lifecycle and SIGTERM passed.
tinyjs native WebView: task CRUD and native window title passed.
```

`verify:tinyjs` は実際のMacのWebViewウィンドウを一時的に開き、タスクの追加・完了切替・削除・ネイティブのウィンドウ名更新を検証する。検証用アプリは終了する。

### 5. 開発アプリを目視で確認する

```sh
pnpm --filter @examples/tinyjs-desktop dev
```

次を確認する。

1. 「Zelt Tasks」ウィンドウが開き、「バックエンド接続済み」と初期タスク2件が表示される。
2. 「Macから追加」を追加できる。日本語が崩れず表示される。
3. チェックボックスで完了を切り替えると、取り消し線と完了件数が更新される。
4. 削除ボタンで対象のタスクが消える。
5. 「ウィンドウ名を更新」を押すと、実際のタイトルバーが「今日のタスク — Zelt × tinyjs」になる。
6. アプリを終了すると、起動したターミナルのプロセスも終了する。devコマンドが残っていればCtrl+Cで止める。

タスクはメモリ保存なので、再起動すると初期の2件に戻る。これはこの実行例の仕様。

### 6. macOSの.appを確認する

まず開発アプリを終了してからビルドする。

```sh
pnpm --filter @examples/tinyjs-desktop package
codesign --verify --deep --strict --verbose=2 "examples/tinyjs-desktop/dist/Zelt Tasks.app"
file "examples/tinyjs-desktop/dist/Zelt Tasks.app/Contents/MacOS/zelt-tinyjs-tasks"
file "examples/tinyjs-desktop/dist/Zelt Tasks.app/Contents/MacOS/tjs"
open "examples/tinyjs-desktop/dist/Zelt Tasks.app"
```

macOSでは `tinyjs.json` のtitleから `Zelt Tasks.app` が作られる。上の2つの実行ファイルは、使用中のMacで実行できるCPUアーキテクチャであることを確認する。

開いた.appで手順5の追加・完了・削除・タイトル更新を再確認し、最後にCmd+Qで終了する。ビルドした.appのまま、Finderからの起動も確認する。

macOSの.appは、stockのtjsとアプリのデータファイルを内包し、ネイティブlauncherがバックエンドを起動する構成。自動検証の `--packaged` はbare binaryを実行するため、Macの.app確認の代わりにはならない。Macではこの手動確認を完了条件にする。

ローカル確認の署名はtinyjsの既定のad-hoc署名でよい。配布用Developer ID署名・公証は、この動作確認とは別の工程。[公式のビルド・署名説明](https://tinyjs.app/docs.html#cli)。

### 失敗した場合に残す情報

- `sw_vers -productVersion`、`uname -m`、`node --version`、`pnpm --version`、`tinyjs version`。
- どの手順で失敗したかと、そのターミナルのエラー全文。
- 白い画面、未接続、操作時エラーなど、画面で起きたこと。
- .app起動だけ失敗する場合は上記 `codesign --verify` と `file` の結果。

開発アプリの詳細ログは次で取れる。

```sh
TINYJS_DEBUG=1 pnpm --filter @examples/tinyjs-desktop dev 2>&1 | tee tinyjs-macos-dev.log
```

自動検証に失敗した場合は、失敗したコマンドを次の形式で再実行してログを残す。

```sh
pnpm verify:tinyjs 2>&1 | tee tinyjs-macos-verify.log
```
