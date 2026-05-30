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
  echo "  dist    Use local packages (file:../../packages/*)"
  echo "  pack    Use packed tarballs (file:../.pack-cache/*.tgz)"
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
  "validator-valibot"
  "eventbus"
  "rate-limit"
  "hono-client"
  "cli"
)

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
  version=$(npm view "@zeltjs/$pkg" version 2>/dev/null | tail -1)
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

# @zeltjs/* 各パッケージの dependencies/peerDependencies を走査し、
# `catalog:` プロトコルで参照されている依存名を重複なく列挙する。
# (どの依存が catalog 管理かをハードコードせず実際の package.json から導出する)
collect_catalog_dep_names() {
  node -e '
    const fs = require("fs");
    const path = require("path");
    const dir = process.argv[1];
    const names = new Set();
    for (const pkg of fs.readdirSync(dir)) {
      const pj = path.join(dir, pkg, "package.json");
      if (!fs.existsSync(pj)) continue;
      const json = JSON.parse(fs.readFileSync(pj, "utf8"));
      for (const field of ["dependencies", "peerDependencies"]) {
        for (const [name, spec] of Object.entries(json[field] || {})) {
          if (typeof spec === "string" && spec.startsWith("catalog:")) names.add(name);
        }
      }
    }
    for (const name of [...names].sort()) console.log(name);
  ' "$ROOT_DIR/packages"
}

# catalog 参照されている依存を default catalog の実バージョンに固定する
# pnpm.overrides 用 JSON 断片を生成する (例: "hono": "4.12.16","valibot": "1.3.1")
build_catalog_overrides() {
  local fragment="" name version
  while IFS= read -r name; do
    [[ -z "$name" ]] && continue
    version=$(get_catalog_version "$name")
    if [[ -z "$version" ]]; then
      echo "ERROR: '$name' は catalog: 参照だが default catalog に版が無い" >&2
      exit 1
    fi
    fragment="$fragment\"$name\": \"$version\","
  done < <(collect_catalog_dep_names)
  echo "${fragment%,}"
}

generate_package_json() {
  local mode="$1"
  local integration_dir="$2"
  local name
  name=$(basename "$integration_dir")

  local deps=""
  local overrides=""

  case "$mode" in
    dist)
      for pkg in "${PACKAGES[@]}"; do
        deps="$deps\"@zeltjs/$pkg\": \"file:../../packages/$pkg\","
        overrides="$overrides\"@zeltjs/$pkg\": \"file:../../packages/$pkg\","
      done
      ;;
    pack)
      for pkg in "${PACKAGES[@]}"; do
        deps="$deps\"@zeltjs/$pkg\": \"file:../.pack-cache/zeltjs-$pkg-0.0.0.tgz\","
        overrides="$overrides\"@zeltjs/$pkg\": \"file:../.pack-cache/zeltjs-$pkg-0.0.0.tgz\","
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
  local hono_ver valibot_ver to_json_schema_ver types_node_ver
  hono_ver=$(get_catalog_version "hono")
  valibot_ver=$(get_catalog_version "valibot")
  to_json_schema_ver=$(get_catalog_version "@valibot/to-json-schema")
  types_node_ver=$(get_catalog_version "@types/node")

  # @zeltjs/* が catalog: で参照する依存を実バージョンに固定する overrides 断片
  local catalog_overrides
  catalog_overrides=$(build_catalog_overrides)

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
    "@types/node": "$types_node_ver"
  }
}
EOF
  else
    # dist/pack モードは @zeltjs/* を file: でソース参照するため、各 package.json の
    # `catalog:` 指定が workspace 外 (--ignore-workspace) で解決できない。
    # catalog 管理の第三者ランタイム依存を overrides で実バージョンに固定して解決する。
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
    "@types/node": "$types_node_ver"
  },
  "pnpm": {
    "overrides": {
      $overrides,
      $catalog_overrides
    }
  }
}
EOF
  fi
}

# Mode-level preparation (run once before iterating dirs)
prepare_dist_mode() {
  echo "Building packages..."
  (cd "$ROOT_DIR" && pnpm -r --filter './packages/*' build >/dev/null 2>&1)
}

prepare_pack_mode() {
  local pack_dir="$INTEGRATION_DIR/.pack-cache"

  rm -rf "$pack_dir"
  mkdir -p "$pack_dir"

  echo "Building packages..."
  (cd "$ROOT_DIR" && pnpm -r --filter './packages/*' build >/dev/null 2>&1)

  echo "Packing all @zeltjs/* packages..."
  for pkg in "${PACKAGES[@]}"; do
    local pkg_dir="$ROOT_DIR/packages/$pkg"
    if [[ -d "$pkg_dir" ]]; then
      (cd "$pkg_dir" && pnpm pack --pack-destination "$pack_dir" >/dev/null 2>&1)
      echo "  ✓ @zeltjs/$pkg"
    fi
  done
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
  node -e '
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
  generate_package_json "$mode" "$integration_dir" > "$integration_dir/package.json"
  merge_extra_deps "$integration_dir"

  echo "  Installing dependencies..."
  (cd "$integration_dir" && rm -rf node_modules pnpm-lock.yaml && pnpm install --ignore-workspace 2>/dev/null)

  echo "  ✓ $name ready"
}

main() {
  case "$MODE" in
    dist)
      prepare_dist_mode
      for dir in $(get_integration_dirs); do
        setup_integration_dir "dist" "$dir"
      done
      ;;
    pack)
      prepare_pack_mode
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
