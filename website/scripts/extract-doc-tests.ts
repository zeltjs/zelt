import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const DOCS_DIR = join(import.meta.dirname, '../docs');
const OUTPUT_DIR = join(import.meta.dirname, '../.generated');

interface CodeBlock {
  code: string;
  index: number;
  hasMultipleFiles: boolean;
}

interface ParsedFile {
  filename: string;
  content: string;
}

const extractTypescriptBlocks = (content: string): CodeBlock[] => {
  const regex = /```typescript\n([\s\S]*?)```/g;
  const rawMatches = [...content.matchAll(regex)];
  let index = 0;

  return rawMatches.flatMap((match) => {
    const code = match[1];
    if (code.includes('// @noRun')) {
      return [];
    }
    return [{ code, index: ++index, hasMultipleFiles: code.includes('// @filename:') }];
  });
};

const parseMultiFileBlock = (code: string): ParsedFile[] => {
  const files: ParsedFile[] = [];
  const parts = code.split(/^\/\/ @filename:\s*(.+)$/m);

  for (let i = 1; i < parts.length; i += 2) {
    const filename = parts[i].trim();
    const content = parts[i + 1]?.trim() ?? '';
    files.push({ filename, content });
  }

  return files;
};

const generateSingleFile = async (
  docName: string,
  file: string,
  block: CodeBlock,
): Promise<void> => {
  const outputPath = join(OUTPUT_DIR, `${docName}-${String(block.index).padStart(3, '0')}.test.ts`);
  const header = `// Source: docs/${file} (block ${block.index})\n\n`;
  await writeFile(outputPath, header + block.code);
};

const generateMultiFile = async (
  docName: string,
  file: string,
  block: CodeBlock,
): Promise<void> => {
  const files = parseMultiFileBlock(block.code);
  if (files.length === 0) return;

  const folderName = `${docName}-${String(block.index).padStart(3, '0')}`;
  const folderPath = join(OUTPUT_DIR, folderName);
  await mkdir(folderPath, { recursive: true });

  const lastFile = files[files.length - 1];
  const testFilename = `${lastFile.filename.replace(/\.\w+$/, '')}.test.ts`;

  for (let i = 0; i < files.length; i++) {
    const parsedFile = files[i];
    const isLast = i === files.length - 1;
    const filename = isLast ? testFilename : parsedFile.filename;
    const header = `// Source: docs/${file} (block ${block.index}, file: ${parsedFile.filename})\n\n`;
    await writeFile(join(folderPath, filename), header + parsedFile.content);
  }
};

const main = async () => {
  await rm(OUTPUT_DIR, { recursive: true, force: true });
  await mkdir(OUTPUT_DIR, { recursive: true });

  const files = await readdir(DOCS_DIR, { recursive: true });
  const mdFiles = files.filter((f) => f.endsWith('.md'));

  for (const file of mdFiles) {
    const content = await readFile(join(DOCS_DIR, file), 'utf-8');
    const blocks = extractTypescriptBlocks(content);
    const docName = file.replace(/[\\/]/g, '-').replace(/\.md$/, '');

    for (const block of blocks) {
      if (block.hasMultipleFiles) {
        await generateMultiFile(docName, file, block);
      } else {
        await generateSingleFile(docName, file, block);
      }
    }
  }

  console.log(`Generated tests from ${mdFiles.length} doc files`);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
