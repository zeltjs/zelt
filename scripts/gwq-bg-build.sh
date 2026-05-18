#!/bin/sh
set -e
cd "$1"
pnpm build > "/tmp/zelt-build-$(basename "$1").log" 2>&1 &
