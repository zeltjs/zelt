#!/usr/bin/env bash
set -euo pipefail

# packages/*/**/*.tsx: throw-trace's parser cannot handle JSX syntax and fatals
# with "Syntax error: Expected `>` but found Identifier" on any .tsx file
# (verified against throw-trace 0.1.7 on main.tsx). The studio UI is the only
# .tsx code under packages/, so the gap was previously undiscovered. Only .tsx
# is excluded; its .ts files are scanned like any other package source.
# Repay: once throw-trace supports JSX/TSX parsing, drop this exclude and let
# it scan the SPA .tsx files like any other package source.
exec throw-trace check \
  --exclude '**/*.test.ts' \
  --exclude '**/dist/**' \
  --exclude 'packages/studio-ui/**/*.tsx' \
  packages
