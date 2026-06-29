import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runBuild } from './build.command';
import { ZeltBuildCommandConflictError, ZeltBuildError, ZeltNoEntryError } from './cli.errors';

describe('runBuild', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `zelt-cli-build-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('runs build.command without requiring a tsdown entry', async () => {
    const command = `node -e "require('node:fs').writeFileSync('built.txt', 'ok')"`;
    await writeFile(
      join(testDir, 'zelt.config.ts'),
      `
        export default {
          app: () => ({}),
          build: {
            command: ${JSON.stringify(command)},
          },
        };
      `,
    );

    await runBuild(testDir, {});

    await expect(readFile(join(testDir, 'built.txt'), 'utf8')).resolves.toBe('ok');
  });

  it('throws when build.command is configured with a plugin build hook', async () => {
    await writeFile(
      join(testDir, 'zelt.config.ts'),
      `
        export default {
          app: () => ({}),
          plugins: [
            {
              name: 'custom-builder',
              build: async () => {},
            },
          ],
          build: {
            command: "node -e \\"process.exit(0)\\"",
          },
        };
      `,
    );

    await expect(runBuild(testDir, {})).rejects.toThrow(ZeltBuildCommandConflictError);
  });

  it('runs a plugin build hook without requiring a tsdown entry', async () => {
    await writeFile(
      join(testDir, 'zelt.config.ts'),
      `
        import { writeFile } from 'node:fs/promises';

        export default {
          app: () => ({}),
          plugins: [
            {
              name: 'custom-builder',
              build: async ({ cwd }) => {
                await writeFile(new URL('./plugin-built.txt', \`file://\${cwd}/\`), 'ok');
              },
            },
          ],
          build: {},
        };
      `,
    );

    await runBuild(testDir, {});

    await expect(readFile(join(testDir, 'plugin-built.txt'), 'utf8')).resolves.toBe('ok');
  });

  it('throws a build error when build.command exits non-zero', async () => {
    await writeFile(
      join(testDir, 'zelt.config.ts'),
      `
        export default {
          app: () => ({}),
          build: {
            command: "node -e \\"process.exit(7)\\"",
          },
        };
      `,
    );

    await expect(runBuild(testDir, {})).rejects.toThrow(ZeltBuildError);
  });

  it('still requires an entry for the default tsdown build', async () => {
    await writeFile(
      join(testDir, 'zelt.config.ts'),
      `
        export default {
          app: () => ({}),
          build: {},
        };
      `,
    );

    await expect(runBuild(testDir, {})).rejects.toThrow(ZeltNoEntryError);
  });
});
