#!/usr/bin/env bash
set -euo pipefail

# Format all files, but only re-stage files that were already staged.
# Unstaged files get formatted in the working tree (benefiting future commits)
# but are NOT added to the current commit.

STAGED_FILE=$(mktemp)
trap 'rm -f "$STAGED_FILE"' EXIT

git diff --cached -z --name-only --diff-filter=ACMR >"$STAGED_FILE"

pnpm format

if [ -s "$STAGED_FILE" ]; then
  xargs -0 git add -- <"$STAGED_FILE"
fi
