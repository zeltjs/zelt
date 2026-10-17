#!/usr/bin/env bash
set -euo pipefail

# studio-ui のテスト fixture (ec-backend.snapshot.json) が、いまの抽出器の出力と
# 一致していることを確かめる。
#
# 抽出は integration/ec-backend の app を子プロセスで読み込むので、そのアプリの依存が
# 揃っていないと zelt/routes が取れず抽出が失敗する。integration/* は pnpm workspace の
# 外にあり、package.json ごと switch-mode.sh が生成するため、ここで同じ手順を共有する。
# 依存準備は第三者依存を再利用し、配布物の独立したコピーを毎回同期する。

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

prepare_app
extract_snapshot

git diff --exit-code -- "$FIXTURE"
