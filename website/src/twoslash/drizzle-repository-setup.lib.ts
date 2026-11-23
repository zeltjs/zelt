import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

// The guide's blocks read one app: its schema, its database service and the repositories and
// models the real generator wrote from that schema (scripts/drizzle-repository-guide.test.ts).
export const drizzleRepositoryFiles = (fixtureDir: string): Readonly<Record<string, string>> =>
  Object.fromEntries(
    readdirSync(fixtureDir, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => {
        const file = path.join(entry.parentPath, entry.name);
        const name = path.relative(fixtureDir, file).split(path.sep).join('/');
        return [`drizzle-repository/${name}`, readFileSync(file, 'utf8')];
      }),
  );
