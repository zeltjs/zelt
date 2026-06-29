import { EventEmitter } from 'node:events';

import { describe, expect, it, vi } from 'vitest';

import { ZeltBuildError } from './cli.errors';

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
}));

const createChild = () => {
  const child = new EventEmitter();
  spawnMock.mockReturnValue(child);
  return child;
};

describe('runCommandBuild', () => {
  it('fails when the child process closes because of a signal', async () => {
    const { runCommandBuild } = await import('./command-build.lib');
    const child = createChild();

    const result = runCommandBuild({
      cwd: '/project',
      command: 'vite build',
      env: { PATH: '/bin' },
    });
    child.emit('close', null, 'SIGTERM');

    await expect(result).rejects.toThrow(ZeltBuildError);
  });
});
