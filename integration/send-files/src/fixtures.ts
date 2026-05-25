import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = dirname(fileURLToPath(import.meta.url));

export const README_PATH = join(moduleDir, 'fixtures', 'Readme.md');

export const README_BUFFER = readFileSync(README_PATH);
export const README_STRING = README_BUFFER.toString('utf8');
