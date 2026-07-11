import { beforeEach, describe, expect, it } from 'vitest';

import { loadHideNodeModules, saveHideNodeModules } from './settings.lib';

describe('settings', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('defaults to false (show everything) when nothing is saved', () => {
    expect(loadHideNodeModules()).toBe(false);
  });

  it('round-trips the saved flag', () => {
    saveHideNodeModules(true);
    expect(loadHideNodeModules()).toBe(true);

    saveHideNodeModules(false);
    expect(loadHideNodeModules()).toBe(false);
  });

  it('falls back to false on corrupted storage', () => {
    window.localStorage.setItem(
      `zelt-studio:hide-node-modules:${window.location.host}`,
      '{not json',
    );
    expect(loadHideNodeModules()).toBe(false);
  });

  it('falls back to false when the parsed JSON is not a boolean', () => {
    window.localStorage.setItem(`zelt-studio:hide-node-modules:${window.location.host}`, '"yes"');
    expect(loadHideNodeModules()).toBe(false);
  });
});
