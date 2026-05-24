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
    "vitest": "3.2.4"
  }
}
EOF
  else
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
    "vitest": "3.2.4"
  },
  "pnpm": {
    "overrides": {
      $overrides
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
setup_integration_dir() {
  local mode="$1"
  local integration_dir="$2"
  local name
  name=$(basename "$integration_dir")

  echo "Setting up $name..."
  generate_package_json "$mode" "$integration_dir" > "$integration_dir/package.json"

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
