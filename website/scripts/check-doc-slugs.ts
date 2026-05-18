#!/usr/bin/env npx tsx
/**
 * Validates that markdown doc files have consistent slugs with their filenames.
 * This ensures LLM-generated links (llms.txt) work correctly.
 *
 * Rules:
 * - Files without slug frontmatter are OK (filename becomes the URL)
 * - Files with slug must have matching filename (e.g., slug: /foo → foo.md, slug: / → index.md)
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const DOCS_DIR = join(import.meta.dirname, '../docs');

interface Violation {
  file: string;
  slug: string;
  expectedFilename: string;
}

const extractSlug = (content: string): string | null => {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) return null;

  const slugMatch = frontmatterMatch[1].match(/^slug:\s*(.+)$/m);
  if (!slugMatch) return null;

  return slugMatch[1].trim();
};

const getExpectedFilename = (slug: string): string => {
  const normalized = slug.replace(/^\//, '').replace(/\/$/, '');
  if (normalized === '') return 'index.md';
  return `${normalized.split('/').pop()}.md`;
};

const scanDirectory = async (dir: string): Promise<Violation[]> => {
  const violations: Violation[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      violations.push(...(await scanDirectory(fullPath)));
      continue;
    }

    if (!entry.name.endsWith('.md')) continue;

    const content = await readFile(fullPath, 'utf-8');
    const slug = extractSlug(content);

    if (!slug) continue;

    const expectedFilename = getExpectedFilename(slug);
    if (entry.name !== expectedFilename) {
      violations.push({
        file: relative(DOCS_DIR, fullPath),
        slug,
        expectedFilename,
      });
    }
  }

  return violations;
};

const main = async () => {
  const violations = await scanDirectory(DOCS_DIR);

  if (violations.length === 0) {
    console.log('✓ All doc slugs are consistent with filenames');
    process.exit(0);
  }

  console.error('Doc slug/filename mismatches found:\n');
  for (const v of violations) {
    console.error(`  ${v.file}`);
    console.error(`    slug: ${v.slug}`);
    console.error(`    expected filename: ${v.expectedFilename}`);
    console.error('');
  }

  console.error('Fix: Either rename the file to match the slug, or remove the slug frontmatter.');
  process.exit(1);
};

main();
