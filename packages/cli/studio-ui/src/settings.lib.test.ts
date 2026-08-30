import { beforeEach, describe, expect, it } from 'vitest';

import {
  loadGroupByFolder,
  loadHideNodeModules,
  saveGroupByFolder,
  saveHideNodeModules,
} from './settings.lib';

describe('settings', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  describe('hideNodeModules', () => {
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

  describe('groupByFolder', () => {
    it('defaults to true (current grouped behavior) when nothing is saved', () => {
      expect(loadGroupByFolder()).toBe(true);
    });

    it('round-trips the saved flag', () => {
      saveGroupByFolder(false);
      expect(loadGroupByFolder()).toBe(false);

      saveGroupByFolder(true);
      expect(loadGroupByFolder()).toBe(true);
    });

    it('falls back to true on corrupted storage', () => {
      window.localStorage.setItem(
        `zelt-studio:group-by-folder:${window.location.host}`,
        '{not json',
      );
      expect(loadGroupByFolder()).toBe(true);
    });

    it('falls back to true when the parsed JSON is not a boolean', () => {
      window.localStorage.setItem(`zelt-studio:group-by-folder:${window.location.host}`, '"yes"');
      expect(loadGroupByFolder()).toBe(true);
    });
  });
});
