#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
INTEGRATION_DIR="$ROOT_DIR/integration"

MODE="${1:-}"
TARGET="${2:-all}"

if [[ -z "$MODE" ]]; then
  echo "Usage: $0 <mode> [target]"
  echo ""
  echo "Modes:"
  echo "  dist    Use immutable local distribution directories"
  echo "  pack    Use immutable packed tarballs"
  echo "  public  Use npm registry (latest versions)"
  echo ""
  echo "Target: all (default) or specific integration test directory"
  exit 1
fi

PACKAGES=(
  "core"
  "unsafe-type-lib"
  "adapter-node"
  "adapter-bun"
  "adapter-cloudflare-workers"
  "adapter-electron"
  "adapter-lambda"
  "testing"
  "auth-jwt"
  "auth-session"
  "db"
  "kv"
  "decorator-metadata"
  "redis"
  "openapi"
  "graphql"
  "validator-valibot"
  "eventbus"
  "rate-limit"
  "hono-client"
  "cli"
)

# Volta の node/npm shim は CWD から manifest (package.json) を探すため、
# 呼び出し元の CWD に壊れた/生成途中の package.json があると起動自体に失敗する。
# node/npm はすべてルート (manifest が常に正常) を CWD にして実行する。
run_at_root() {
  (cd "$ROOT_DIR" && "$@")
}

get_volta_section() {
  run_at_root node -e '
    const pkg = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    const v = pkg.volta || {};
    const parts = Object.entries(v).map(([k, val]) => `    "${k}": "${val}"`);
    console.log(parts.join(",\n"));
  ' "$ROOT_DIR/package.json"
}

get_integration_dirs() {
  if [[ "$TARGET" == "all" ]]; then
    find "$INTEGRATION_DIR" -maxdepth 1 -mindepth 1 -type d ! -name scripts ! -name '.pack-cache' ! -name '.*'
  else
    echo "$INTEGRATION_DIR/$TARGET"
  fi
}

get_npm_version() {
  local pkg="$1"
  local version
  version=$(run_at_root npm view "@zeltjs/$pkg" version 2>/dev/null | tail -1)
  if [[ -z "$version" ]]; then
    echo "latest"
  else
    echo "$version"
  fi
}

# root pnpm-workspace.yaml の default catalog から指定キーのバージョンを取得する
# (catalog を単一の情報源とし、integration 用 package.json への版のハードコードを避ける)
get_catalog_version() {
  local key="$1"
  awk -v key="$key" '
    /^catalog:[[:space:]]*$/ { in_cat = 1; next }
    /^[^[:space:]]/ { in_cat = 0 }
    in_cat {
      line = $0
      gsub(/^[[:space:]]+/, "", line)
      gsub(/"/, "", line)
      n = index(line, ":")
      if (n > 0) {
        k = substr(line, 1, n - 1)
        v = substr(line, n + 1)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", v)
        if (k == key) { print v; exit }
      }
    }
  ' "$ROOT_DIR/pnpm-workspace.yaml"
}

generate_package_json() {
  local mode="$1"
  local integration_dir="$2"
  local name
  name=$(basename "$integration_dir")

  local deps=""
  local overrides=""

  case "$mode" in
    dist|pack)
      for pkg in "${PACKAGES[@]}"; do
        local spec="${ARTIFACT_SPECS[$pkg]}"
        deps="$deps\"@zeltjs/$pkg\": \"$spec\","
        overrides="$overrides\"@zeltjs/$pkg\": \"$spec\","
      done
      ;;
    public)
      for pkg in "${PACKAGES[@]}"; do
        local version
        version=$(get_npm_version "$pkg")
        deps="$deps\"@zeltjs/$pkg\": \"$version\","
      done
      ;;
  esac

  deps="${deps%,}"
  overrides="${overrides%,}"

  # integration テストが直接 import するライブラリ。版は root catalog を単一の情報源とする
  local hono_ver valibot_ver to_json_schema_ver types_node_ver typescript_ver
  hono_ver=$(get_catalog_version "hono")
  valibot_ver=$(get_catalog_version "valibot")
  to_json_schema_ver=$(get_catalog_version "@valibot/to-json-schema")
  types_node_ver=$(get_catalog_version "@types/node")
  typescript_ver=$(get_catalog_version "typescript")

  local volta_section
  volta_section=$(get_volta_section)

  if [[ "$mode" == "public" ]]; then
    cat <<EOF
{
  "name": "@integration/$name",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    $deps
  },
  "devDependencies": {
    "vitest": "3.2.4",
    "valibot": "$valibot_ver",
    "@valibot/to-json-schema": "$to_json_schema_ver",
    "hono": "$hono_ver",
    "@types/node": "$types_node_ver",
    "typescript": "$typescript_ver"
  },
  "volta": {
$volta_section
  },
  "pnpm": { "onlyBuiltDependencies": ["better-sqlite3", "esbuild"] }
}
EOF
  else
    # pnpm pack has already resolved workspace: and catalog: in the artifacts.
    cat <<EOF
{
  "name": "@integration/$name",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    $deps
  },
  "devDependencies": {
    "vitest": "3.2.4",
    "valibot": "$valibot_ver",
    "@valibot/to-json-schema": "$to_json_schema_ver",
    "hono": "$hono_ver",
    "@types/node": "$types_node_ver",
    "typescript": "$typescript_ver"
  },
  "volta": {
$volta_section
  },
  "pnpm": {
    "onlyBuiltDependencies": ["better-sqlite3", "esbuild"],
    "overrides": {
      $overrides
    }
  }
}
EOF
  fi
}

# Distribution generation is an explicit Nx target, including on cache hits.
declare -A ARTIFACT_SPECS=()
prepare_distributions() {
  (cd "$ROOT_DIR" && pnpm nx run-many -t distribution --projects='@zeltjs/*')
  local specs
  specs=$(run_at_root node --input-type=module - "$MODE" "${PACKAGES[@]}" <<'NODE'
import { materializeDistribution } from './scripts/pack-distribution.mjs';
const [mode, ...packages] = process.argv.slice(2);
for (const name of packages) {
  const base = `packages/${name}/.artifacts`;
  const artifact = materializeDistribution(`packages/${name}`);
  const path = mode === 'pack' ? artifact.tarball : artifact.directory;
  console.log(`${name}\tfile:../../${base}/${path}`);
}
NODE
  )
  local name spec
  while IFS=$'\t' read -r name spec; do
    ARTIFACT_SPECS["$name"]="$spec"
  done <<< "$specs"
}

# Per-directory setup (generate package.json + install)
merge_extra_deps() {
  local integration_dir="$1"
  local extra_file="$integration_dir/package.extra.json"
  local pkg_file="$integration_dir/package.json"

  if [[ ! -f "$extra_file" ]]; then
    return
  fi

  echo "  Merging package.extra.json..."
  run_at_root node -e '
    const fs = require("fs");
    const pkg = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const extra = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
    for (const field of ["dependencies", "devDependencies", "scripts"]) {
      if (extra[field]) {
        pkg[field] = { ...(pkg[field] || {}), ...extra[field] };
      }
    }
    fs.writeFileSync(process.argv[1], JSON.stringify(pkg, null, 2) + "\n");
  ' "$pkg_file" "$extra_file"
}

setup_integration_dir() {
  local mode="$1"
  local integration_dir="$2"
  local name
  name=$(basename "$integration_dir")

  echo "Setting up $name..."
  # `> package.json` 直書きだと、リダイレクトの truncate が先に走るため
  # 生成が途中で失敗すると空の package.json が残り、以後の Volta 経由の
  # コマンドがすべて manifest パースエラーになる。一時ファイル経由で置き換える。
  local tmp_pkg
  tmp_pkg=$(mktemp "$integration_dir/package.json.XXXXXX")
  generate_package_json "$mode" "$integration_dir" > "$tmp_pkg"
  mv "$tmp_pkg" "$integration_dir/package.json"
  merge_extra_deps "$integration_dir"

  run_at_root node "$ROOT_DIR/scripts/prepare-integration-deps.mjs" "$integration_dir" "$mode"

  echo "  ✓ $name ready"
}

main() {
  case "$MODE" in
    dist)
      prepare_distributions
      for dir in $(get_integration_dirs); do
        setup_integration_dir "dist" "$dir"
      done
      ;;
    pack)
      prepare_distributions
      for dir in $(get_integration_dirs); do
        setup_integration_dir "pack" "$dir"
      done
      ;;
    public)
      echo "Fetching latest versions from npm..."
      for dir in $(get_integration_dirs); do
        setup_integration_dir "public" "$dir"
      done
      ;;
    *)
      echo "Unknown mode: $MODE"
      echo "Modes: dist, pack, public"
      exit 1
      ;;
  esac

  echo ""
  echo "Mode switch complete: $MODE"
}

main
