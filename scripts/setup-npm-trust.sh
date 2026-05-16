#!/usr/bin/env bash
set -euo pipefail

# npm trusted publisher setup for @zeltjs/* packages
# Prerequisites:
#   - npm CLI 11.10.0+ (for npm trust command)
#   - npx setup-npm-trusted-publish (azu/setup-npm-trusted-publish)
#   - Logged into npm with 2FA enabled

REPO="zeltjs/zelt"
WORKFLOW="release-please.yml"
SCOPE="@zeltjs"
SLEEP_INTERVAL=2

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Options:
  -y, --yes        Skip confirmation prompt
  -n, --dry-run    Show what would be done without making changes
  -h, --help       Show this help message

Examples:
  $(basename "$0")           # Run setup for all @zeltjs/* packages
  $(basename "$0") --dry-run # Preview without changes
  $(basename "$0") --yes     # Skip confirmation
EOF
}

DRY_RUN=false
SKIP_CONFIRM=false

while [[ $# -gt 0 ]]; do
  case $1 in
    -n|--dry-run)
      DRY_RUN=true
      shift
      ;;
    -y|--yes)
      SKIP_CONFIRM=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

log() {
  echo "[$(date '+%H:%M:%S')] $*"
}

check_npm_version() {
  local current_version
  current_version=$(npm --version 2>/dev/null)
  local major minor
  major=$(echo "$current_version" | cut -d. -f1)
  minor=$(echo "$current_version" | cut -d. -f2)

  if [[ $major -lt 11 ]] || { [[ $major -eq 11 ]] && [[ $minor -lt 10 ]]; }; then
    if [[ "$DRY_RUN" == true ]]; then
      log "WARNING: npm 11.10.0+ required for 'npm trust' command (current: $current_version)"
      log "         Continuing in dry-run mode..."
    else
      echo "Error: npm 11.10.0+ required for 'npm trust' command (current: $current_version)" >&2
      exit 1
    fi
  fi
}

get_zeltjs_packages() {
  pnpm -r exec -- node -p "const p=require('./package.json'); p.private ? '' : p.name" 2>/dev/null \
    | grep "^${SCOPE}/" \
    | sort
}

package_exists_on_npm() {
  local pkg=$1
  npm view "$pkg" --json >/dev/null 2>&1 || return 1
  return 0
}

check_packages_status() {
  local packages=$1
  local -n published_ref=$2
  local -n empty_ref=$3

  while IFS= read -r pkg; do
    if package_exists_on_npm "$pkg"; then
      published_ref+=("$pkg")
    else
      empty_ref+=("$pkg")
    fi
  done <<< "$packages"
}

setup_package() {
  local pkg=$1
  local needs_placeholder=$2

  log "Processing: $pkg"

  if [[ "$needs_placeholder" == true ]]; then
    log "  → Creating placeholder package..."
    if [[ "$DRY_RUN" == true ]]; then
      log "  [DRY-RUN] Would run: npx setup-npm-trusted-publish \"$pkg\""
    else
      npx setup-npm-trusted-publish "$pkg"
    fi
  else
    log "  → Package exists on npm"
  fi

  log "  → Setting up trusted publisher..."
  if [[ "$DRY_RUN" == true ]]; then
    log "  [DRY-RUN] Would run: npm trust github \"$pkg\" --repository \"$REPO\" --workflow \"$WORKFLOW\" --yes"
  else
    npm trust github "$pkg" --repository "$REPO" --workflow "$WORKFLOW" --yes
  fi

  sleep "$SLEEP_INTERVAL"
}

main() {
  log "=== npm Trusted Publisher Setup ==="
  log "Repository: $REPO"
  log "Workflow: $WORKFLOW"
  log "Scope: $SCOPE/*"
  [[ "$DRY_RUN" == true ]] && log "Mode: DRY-RUN"
  echo

  check_npm_version

  local packages
  packages=$(get_zeltjs_packages)
  local count
  count=$(echo "$packages" | wc -l)

  log "Checking $count packages on npm..."
  echo

  local published=()
  local empty=()
  check_packages_status "$packages" published empty

  echo "Published (${#published[@]} packages):"
  if [[ ${#published[@]} -eq 0 ]]; then
    echo "  (none)"
  else
    printf '  - %s\n' "${published[@]}"
  fi
  echo

  echo "Not on npm - will create placeholder (${#empty[@]} packages):"
  if [[ ${#empty[@]} -eq 0 ]]; then
    echo "  (none)"
  else
    printf '  - %s\n' "${empty[@]}"
  fi
  echo

  log "All $count packages will have trusted publisher configured."
  echo

  if [[ "$SKIP_CONFIRM" == false ]]; then
    read -rp "Proceed? [y/N] " answer
    if [[ ! "$answer" =~ ^[Yy]$ ]]; then
      log "Aborted."
      exit 0
    fi
    echo
  fi

  if [[ "$DRY_RUN" == false ]]; then
    log "NOTE: First 2FA prompt will appear. Select 'skip for next 5 minutes' to batch process."
    echo
  fi

  local processed=0
  local failed=0

  for pkg in "${published[@]}"; do
    if setup_package "$pkg" false; then
      processed=$((processed + 1))
    else
      failed=$((failed + 1))
      log "  ✗ Failed: $pkg"
    fi
  done

  for pkg in "${empty[@]}"; do
    if setup_package "$pkg" true; then
      processed=$((processed + 1))
    else
      failed=$((failed + 1))
      log "  ✗ Failed: $pkg"
    fi
  done

  echo
  log "=== Complete ==="
  log "Processed: $processed / $count"
  if [[ $failed -gt 0 ]]; then
    log "Failed: $failed"
    return 1
  fi
}

main
