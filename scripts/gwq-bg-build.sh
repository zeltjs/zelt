#!/bin/sh
set -e
DIR="${1:-$(pwd)}"
cd "$DIR"
pnpm build > "/tmp/zelt-build-$(basename "$DIR").log" 2>&1 &
