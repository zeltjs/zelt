import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { disablesTypeChecking } from '../src/twoslash/code-examples.lib';
import { extractTypeScriptExamples } from '../src/twoslash/documentation-parser.lib';
import { twoslasher } from '../src/twoslash/twoslasher';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const websiteDir = path.resolve(__dirname, '..');

// Both the English docs and the Japanese translation carry the same code
// blocks, so a wrong API name has to be caught in both trees. The `examples/`
// docs are deliberately excluded here: their blocks are verbatim excerpts of
// the real example apps (which are type-checked on their own) and are verified
// by check-example-excerpts.ts instead of being re-type-checked in isolation.
const TARGET_DIRS = ['docs', 'i18n/ja/docusaurus-plugin-content-docs/current', 'src/pages'];

// Skip any markdown that lives under an `examples/` segment (the Japanese
// example docs sit inside the i18n docs tree). Those are excerpt-checked.
const isExampleDoc = (relPath: string): boolean => relPath.split(path.sep).includes('examples');

const walkMarkdown = (dir: string, acc: string[] = []): string[] => {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === 'build' || entry === '.docusaurus') continue;
      walkMarkdown(full, acc);
    } else if (/\.mdx?$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
};

type Failure = { file: string; block: number; message: string };

const compilerErrorLines = (message: string): string[] =>
  message
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^\[\d+]/.test(line));

const failures: Failure[] = [];
let blockCount = 0;

for (const targetDir of TARGET_DIRS) {
  const absDir = path.join(websiteDir, targetDir);
  for (const file of walkMarkdown(absDir)) {
    if (isExampleDoc(path.relative(websiteDir, file))) continue;
    const markdown = readFileSync(file, 'utf8');
    let blockIndex = 0;
    for (const example of await extractTypeScriptExamples(markdown, file)) {
      blockIndex += 1;
      blockCount += 1;
      if (disablesTypeChecking(example)) {
        failures.push({
          file: path.relative(websiteDir, file),
          block: blockIndex,
          message: 'no-check is not allowed; provide the types needed to check the example',
        });
        continue;
      }
      try {
        twoslasher(example.code, example.language);
      } catch (error) {
        const message = (error as Error).message;
        const errors = compilerErrorLines(message);
        failures.push({
          file: path.relative(websiteDir, file),
          block: blockIndex,
          message: errors.length > 0 ? errors.join('\n      ') : message.split('\n')[0],
        });
      }
    }
  }
}

if (failures.length > 0) {
  console.error(
    `\n✗ Doc type-check failed: ${failures.length}/${blockCount} block(s) have errors\n`,
  );
  for (const failure of failures) {
    console.error(`  ${failure.file} (block ${failure.block})`);
    console.error(`      ${failure.message}\n`);
  }
  process.exit(1);
}

console.log(`✓ Doc type-check passed: ${blockCount} block(s) OK`);
