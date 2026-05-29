import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Example docs are NOT type-checked in isolation. Their code blocks must be
// verbatim excerpts of the real, separately type-checked example apps under
// `examples/`. Each TypeScript fence therefore declares its origin via a
// `source=<repo-relative-path>` fence meta, and this script verifies the block
// is a contiguous run of lines in that file — so a block cannot drift from (or
// lie about) the real, compiling source.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const websiteDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(websiteDir, '..');

// Both the English example docs and their Japanese translation carry the same
// excerpts, so both trees are checked.
const TARGET_DIRS = [
  path.join(websiteDir, 'examples'),
  path.join(websiteDir, 'i18n/ja/docusaurus-plugin-content-docs/current/examples'),
];

// Captures: 1=lang, 2=meta string (after the lang), 3=block body.
const TS_FENCE = /```(ts|tsx|typescript|typescriptreact)([^\n]*)\n([\s\S]*?)```/g;

const SOURCE_META = /\bsource=(\S+)/;

const walk = (dir: string, acc: string[] = []): string[] => {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === 'build' || entry === '.docusaurus') continue;
      walk(full, acc);
    } else if (/\.mdx?$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
};

// rstrip every line so trailing-whitespace differences never cause a mismatch.
const normalize = (text: string): string[] =>
  text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''));

const dropOuterBlankLines = (lines: string[]): string[] => {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start] === '') start += 1;
  while (end > start && lines[end - 1] === '') end -= 1;
  return lines.slice(start, end);
};

// Is `needle` a contiguous run of lines inside `haystack`? Returns the 1-based
// start line on success, or null on failure.
const findContiguous = (haystack: string[], needle: string[]): number | null => {
  if (needle.length === 0) return null;
  for (let i = 0; i + needle.length <= haystack.length; i += 1) {
    let matched = true;
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) {
        matched = false;
        break;
      }
    }
    if (matched) return i + 1;
  }
  return null;
};

type Failure = { file: string; block: number; message: string };

const failures: Failure[] = [];
let blockCount = 0;

for (const dir of TARGET_DIRS) {
  for (const file of walk(dir)) {
    const markdown = readFileSync(file, 'utf8');
    let blockIndex = 0;
    for (const match of markdown.matchAll(TS_FENCE)) {
      blockIndex += 1;
      blockCount += 1;
      const meta = match[2] ?? '';
      const body = match[3] ?? '';
      const rel = path.relative(websiteDir, file);

      const sourceMatch = meta.match(SOURCE_META);
      if (!sourceMatch) {
        failures.push({
          file: rel,
          block: blockIndex,
          message:
            'TypeScript fence has no `source=<path>` meta. Example code blocks must be verbatim excerpts of a file under examples/.',
        });
        continue;
      }

      const sourcePath = sourceMatch[1];
      const absSource = path.join(repoRoot, sourcePath);
      if (!existsSync(absSource)) {
        failures.push({
          file: rel,
          block: blockIndex,
          message: `source=${sourcePath} does not exist (resolved to ${path.relative(repoRoot, absSource)}).`,
        });
        continue;
      }

      const excerpt = dropOuterBlankLines(normalize(body));
      const source = normalize(readFileSync(absSource, 'utf8'));
      const at = findContiguous(source, excerpt);
      if (at === null) {
        const firstLine = excerpt[0] ?? '';
        failures.push({
          file: rel,
          block: blockIndex,
          message: `block is not a contiguous excerpt of ${sourcePath}. First block line not aligned: "${firstLine}"`,
        });
      }
    }
  }
}

if (failures.length > 0) {
  console.error(
    `\n✗ Example excerpt check failed: ${failures.length}/${blockCount} block(s) do not match their source\n`,
  );
  for (const failure of failures) {
    console.error(`  ${failure.file} (block ${failure.block})`);
    console.error(`      ${failure.message}\n`);
  }
  process.exit(1);
}

console.log(`✓ Example excerpt check passed: ${blockCount} block(s) match their source`);
