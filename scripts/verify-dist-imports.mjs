#!/usr/bin/env node
import { glob } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SKIP_PACKAGES = new Set([
  'adapter-cloudflare-workers',
]);

const entries = await Array.fromAsync(glob('packages/*/dist/index.js'));

if (entries.length === 0) {
  console.error('No dist/index.js files found. Run build first.');
  process.exit(1);
}

let failed = false;
let skipped = 0;

for (const entry of entries) {
  const pkg = path.normalize(entry).split(path.sep)[1];
  
  if (SKIP_PACKAGES.has(pkg)) {
    console.log(`- ${pkg} (skipped: runtime-specific)`);
    skipped++;
    continue;
  }
  
  try {
    await import(pathToFileURL(entry).href);
    console.log(`✓ ${pkg}`);
  } catch (err) {
    console.error(`✗ ${pkg}: ${err.message}`);
    failed = true;
  }
}

if (failed) {
  console.error('\nSome packages failed to import.');
  process.exit(1);
}

console.log(`\nAll ${entries.length - skipped} packages imported successfully (${skipped} skipped).`);
