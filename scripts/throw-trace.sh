#!/usr/bin/env bash
set -euo pipefail

# packages/cli/studio-ui/**/*.tsx: throw-trace's parser cannot handle JSX
# syntax and fatals with "Syntax error: Expected `>` but found Identifier" on
# any .tsx file (verified against throw-trace 0.1.7 on app.tsx / main.tsx).
# This is the first .tsx code under packages/, so the gap was previously
# undiscovered. Only .tsx is excluded; studio-ui's .ts files are scanned like
# any other package source.
# Repay: once throw-trace supports JSX/TSX parsing, drop this exclude and let
# it scan studio-ui's .tsx files like any other package source.
exec throw-trace check \
  --exclude '**/*.test.ts' \
  --exclude '**/dist/**' \
  --exclude 'packages/cli/studio-ui/**/*.tsx' \
  packages
