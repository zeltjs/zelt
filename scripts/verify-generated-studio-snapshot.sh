#!/usr/bin/env bash
set -euo pipefail

# studio-ui のテスト fixture (ec-backend.snapshot.json) が、いまの抽出器の出力と
# 一致していることを確かめる。
#
# 抽出は integration/ec-backend の app を子プロセスで読み込むので、そのアプリの依存が
# 揃っていないと zelt/routes が取れず抽出が失敗する。integration/* は pnpm workspace の
# 外にあり、package.json ごと switch-mode.sh が生成するため、ここで同じ手順を共有する。
# 依存は packages/*/dist の複製なので build を跨ぐと古く/壊れうる。失敗したら入れ直して
# 一度だけやり直す (それでも失敗するなら抽出そのものの失敗)。

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT_DIR/integration/ec-backend"
CONFIG="packages/studio-ui/ec-backend.extract.json"
FIXTURE="packages/studio-ui/test-fixtures/ec-backend.snapshot.json"

prepare_app() {
  echo "Preparing integration/ec-backend..."
  # packages の build は呼び出し側 (precommit / CI) が先に済ませている
  ZELT_SKIP_PACKAGE_BUILD=1 "$ROOT_DIR/integration/scripts/switch-mode.sh" dist ec-backend
}

extract_snapshot() {
  node "$ROOT_DIR/packages/cli/dist/cli.js" studio extract --config "$CONFIG"
}

cd "$ROOT_DIR"

# クリーンな checkout には package.json すら無いので、無駄な1回目を走らせずに用意する
if [[ ! -f "$APP_DIR/package.json" ]]; then
  prepare_app
fi

if ! extract_snapshot; then
  echo "studio extract failed; reinstalling integration/ec-backend and retrying once"
  prepare_app
  extract_snapshot
fi

git diff --exit-code -- "$FIXTURE"
