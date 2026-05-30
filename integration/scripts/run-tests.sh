#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
INTEGRATION_DIR="$ROOT_DIR/integration"

MODE="${1:-dist}"
TARGET="${2:-all}"

usage() {
  echo "Usage: $0 [mode] [target]"
  echo ""
  echo "Modes:"
  echo "  dist    Use local packages (default)"
  echo "  pack    Use packed tarballs"
  echo "  public  Use npm registry"
  echo "  all     Run tests in all modes"
  echo ""
  echo "Target:"
  echo "  all        Run all integration tests (default)"
  echo "  <name>     Run specific integration test directory"
  echo ""
  echo "Examples:"
  echo "  $0                    # dist mode, all tests"
  echo "  $0 pack               # pack mode, all tests"
  echo "  $0 dist hello-world   # dist mode, hello-world only"
  echo "  $0 all                # run all modes"
}

get_integration_dirs() {
  if [[ "$TARGET" == "all" ]]; then
    find "$INTEGRATION_DIR" -maxdepth 1 -mindepth 1 -type d ! -name scripts ! -name '.pack-cache' ! -name '.*'
  else
    echo "$INTEGRATION_DIR/$TARGET"
  fi
}

run_tests() {
  local exit_code=0

  for dir in $(get_integration_dirs); do
    local name
    name=$(basename "$dir")
    echo ""
    echo "=========================================="
    echo "Running tests: $name"
    echo "=========================================="

    if (cd "$dir" && npx tsc --noEmit); then
      echo "✓ $name: tsc --noEmit passed"
    else
      echo "✗ $name: tsc --noEmit FAILED"
      exit_code=1
    fi

    if (cd "$dir" && pnpm test); then
      echo "✓ $name: PASSED"
    else
      echo "✗ $name: FAILED"
      exit_code=1
    fi
  done

  return $exit_code
}

main() {
  case "$MODE" in
    -h|--help)
      usage
      exit 0
      ;;
    dist|pack|public)
      echo "============================================"
      echo "MODE: $MODE"
      echo "============================================"
      "$SCRIPT_DIR/switch-mode.sh" "$MODE" "$TARGET"
      run_tests
      ;;
    all)
      echo "Running tests in all modes..."
      local exit_code=0

      for mode in dist pack public; do
        echo ""
        echo "============================================"
        echo "MODE: $mode"
        echo "============================================"
        "$SCRIPT_DIR/switch-mode.sh" "$mode" "$TARGET"
        if ! run_tests; then
          exit_code=1
        fi
      done

      exit $exit_code
      ;;
    *)
      echo "Unknown mode: $MODE"
      usage
      exit 1
      ;;
  esac
}

main
