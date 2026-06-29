import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
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

  const writeBin = async (rootDir: string, name: string, content: string): Promise<void> => {
    const binDir = join(rootDir, 'node_modules', '.bin');
    await mkdir(binDir, { recursive: true });
    const binPath = join(binDir, name);
    await writeFile(binPath, `#!/usr/bin/env node\n${content}`);
    await chmod(binPath, 0o755);
    await writeFile(`${binPath}.cmd`, `@echo off\r\nnode "%~dp0\\${name}" %*\r\n`);
  };

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

  it('resolves build.command from ancestor node_modules/.bin', async () => {
    const workspaceDir = join(testDir, 'workspace');
    const projectDir = join(workspaceDir, 'app');
    await mkdir(projectDir, { recursive: true });
    await writeBin(
      workspaceDir,
      'custom-builder',
      `require('node:fs').writeFileSync('custom-built.txt', 'ok');\n`,
    );
    await writeFile(
      join(projectDir, 'zelt.config.ts'),
      `
        export default {
          app: () => ({}),
          build: {
            command: "custom-builder",
          },
        };
      `,
    );

    await runBuild(projectDir, {});

    await expect(readFile(join(projectDir, 'custom-built.txt'), 'utf8')).resolves.toBe('ok');
  });

  it('runs the default tsdown build through the same ancestor bin resolution', async () => {
    const workspaceDir = join(testDir, 'workspace');
    const projectDir = join(workspaceDir, 'app');
    await mkdir(projectDir, { recursive: true });
    await writeBin(
      workspaceDir,
      'tsdown',
      `require('node:fs').writeFileSync('tsdown-args.txt', process.argv.slice(2).join(' '));\nrequire('node:fs').writeFileSync('default-built.txt', 'ok');\n`,
    );
    await writeFile(
      join(projectDir, 'zelt.config.ts'),
      `
        export default {
          app: () => ({}),
          build: {
            entry: "./src/main.ts",
            outDir: "./dist",
          },
        };
      `,
    );

    await runBuild(projectDir, {});

    await expect(readFile(join(projectDir, 'default-built.txt'), 'utf8')).resolves.toBe('ok');
    await expect(readFile(join(projectDir, 'tsdown-args.txt'), 'utf8')).resolves.toContain(
      '--entry ./src/main.ts --out-dir ./dist',
    );
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
