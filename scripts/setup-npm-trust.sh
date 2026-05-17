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

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Options:
  -y, --yes        Skip confirmation prompts
  -n, --dry-run    Show what would be done without making changes
  -h, --help       Show this help message

Steps (each requires confirmation):
  1. List packages (no auth required)
  2. Check trusted publisher status (2FA required)
  3. Setup trusted publishers (2FA required)

Examples:
  $(basename "$0")           # Run interactively
  $(basename "$0") --dry-run # Preview without changes
  $(basename "$0") --yes     # Skip all confirmations
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

confirm() {
  local prompt=$1
  if [[ "$SKIP_CONFIRM" == true ]]; then
    return 0
  fi
  read -rp "$prompt [y/N] " answer
  [[ "$answer" =~ ^[Yy]$ ]]
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

get_private_packages() {
  pnpm -r exec -- node -p "const p=require('./package.json'); p.private && p.name?.startsWith('${SCOPE}/') ? p.name : ''" 2>/dev/null \
    | grep "^${SCOPE}/" \
    | sort \
    || true
}

package_exists_on_npm() {
  local pkg=$1
  npm view "$pkg" --json >/dev/null 2>&1 || return 1
  return 0
}


setup_package() {
  local pkg=$1
  local needs_placeholder=$2

  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log "Processing: $pkg"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

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
    log "  [DRY-RUN] Would run: npm trust github \"$pkg\" --repository \"$REPO\" --file \"$WORKFLOW\" --yes"
  else
    npm trust github "$pkg" --repository "$REPO" --file "$WORKFLOW" --yes
  fi
  echo
}

main() {
  log "=== npm Trusted Publisher Setup ==="
  log "Repository: $REPO"
  log "Workflow: $WORKFLOW"
  log "Scope: $SCOPE/*"
  [[ "$DRY_RUN" == true ]] && log "Mode: DRY-RUN"
  echo

  check_npm_version

  # ============================================================
  # Step 1: List packages (no auth required)
  # ============================================================
  log "Step 1: Listing packages..."
  echo

  local packages
  packages=$(get_zeltjs_packages)
  local private_packages
  private_packages=$(get_private_packages)
  local count
  count=$(echo "$packages" | wc -l)

  log "Checking $count public packages on npm..."
  echo

  local published=()
  local not_on_npm=()

  while IFS= read -r pkg; do
    if package_exists_on_npm "$pkg"; then
      published+=("$pkg")
    else
      not_on_npm+=("$pkg")
    fi
  done <<< "$packages"

  echo "Published (${#published[@]} packages):"
  if [[ ${#published[@]} -eq 0 ]]; then
    echo "  (none)"
  else
    printf '  - %s\n' "${published[@]}"
  fi
  echo

  echo "Not on npm (${#not_on_npm[@]} packages):"
  if [[ ${#not_on_npm[@]} -eq 0 ]]; then
    echo "  (none)"
  else
    printf '  - %s\n' "${not_on_npm[@]}"
  fi
  echo

  local private_count=0
  if [[ -n "$private_packages" ]]; then
    private_count=$(echo "$private_packages" | wc -l)
  fi
  echo "Private (${private_count} packages):"
  if [[ $private_count -eq 0 ]]; then
    echo "  (none)"
  else
    echo "$private_packages" | while read -r pkg; do
      echo "  - $pkg"
    done
  fi
  echo

  # ============================================================
  # Step 2: Check trusted publisher status (2FA required)
  # ============================================================
  if [[ ${#published[@]} -gt 0 ]]; then
    if ! confirm "Step 2: Check trusted publisher status? (requires 2FA)"; then
      log "Aborted."
      exit 0
    fi
    echo

    log "Step 2: Checking trusted publisher status..."
    log "NOTE: 2FA authentication will be required for each package."
    echo

    local configured=()
    local needs_setup=()

    for pkg in "${published[@]}"; do
      echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
      echo "Checking: $pkg"
      echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
      npm trust list "$pkg"
      echo
      read -rp "Is trusted publisher configured? [y/N] " answer
      if [[ "$answer" =~ ^[Yy]$ ]]; then
        configured+=("$pkg")
        echo "  → $pkg ✓"
      else
        needs_setup+=("$pkg")
        echo "  → $pkg ✗"
      fi
      echo
    done

    log "${#configured[@]} configured, ${#needs_setup[@]} needs setup."
    echo

    # Update published to only those needing setup
    published=("${needs_setup[@]+"${needs_setup[@]}"}")
  fi

  # ============================================================
  # Step 3: Setup trusted publishers (2FA required)
  # ============================================================
  local to_process=$((${#published[@]} + ${#not_on_npm[@]}))

  if [[ $to_process -eq 0 ]]; then
    log "Nothing to configure. All packages are already set up."
    exit 0
  fi

  log "$to_process packages to configure."
  echo

  if ! confirm "Step 3: Setup trusted publishers? (requires 2FA)"; then
    log "Aborted."
    exit 0
  fi
  echo

  if [[ "$DRY_RUN" == false ]]; then
    log "NOTE: 2FA authentication will be required for each package."
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

  for pkg in "${not_on_npm[@]}"; do
    if setup_package "$pkg" true; then
      processed=$((processed + 1))
    else
      failed=$((failed + 1))
      log "  ✗ Failed: $pkg"
    fi
  done

  echo
  log "=== Complete ==="
  log "Processed: $processed / $to_process"
  if [[ $failed -gt 0 ]]; then
    log "Failed: $failed"
    return 1
  fi
}

main
