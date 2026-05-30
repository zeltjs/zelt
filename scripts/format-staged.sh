#!/usr/bin/env bash
set -euo pipefail

# Format all files, but only re-stage files that were already staged.
# Unstaged files get formatted in the working tree (benefiting future commits)
# but are NOT added to the current commit.

STAGED=$(git diff --cached -z --name-only --diff-filter=ACMR)

pnpm format

if [ -n "$STAGED" ]; then
  printf '%s' "$STAGED" | xargs -0 git add
fi
