import { beforeEach, describe, expect, it } from 'vitest';

import {
  defaultCollapsedDirs,
  loadCollapsedDirs,
  loadGroupByFolder,
  loadHideNodeModules,
  saveCollapsedDirs,
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

  describe('collapsedDirs', () => {
    it('returns undefined when nothing is saved (caller falls back to defaultCollapsedDirs)', () => {
      expect(loadCollapsedDirs()).toBeUndefined();
    });

    it('round-trips the saved set', () => {
      saveCollapsedDirs(new Set(['src/foo', 'node_modules/pkg']));
      expect(loadCollapsedDirs()).toEqual(new Set(['src/foo', 'node_modules/pkg']));

      saveCollapsedDirs(new Set());
      expect(loadCollapsedDirs()).toEqual(new Set());
    });

    it('falls back to undefined on corrupted storage', () => {
      window.localStorage.setItem(
        `zelt-studio:collapsed-dirs:${window.location.host}`,
        '{not json',
      );
      expect(loadCollapsedDirs()).toBeUndefined();
    });

    it('falls back to undefined when the parsed JSON is not a string array', () => {
      window.localStorage.setItem(
        `zelt-studio:collapsed-dirs:${window.location.host}`,
        JSON.stringify([1, 2, 3]),
      );
      expect(loadCollapsedDirs()).toBeUndefined();
    });
  });

  describe('defaultCollapsedDirs', () => {
    it('collapses only node_modules-like dirs, leaving the rest expanded', () => {
      const dirs = ['src/foo', 'node_modules/pkg', 'src/bar/node_modules/dep'];
      expect(defaultCollapsedDirs(dirs)).toEqual(
        new Set(['node_modules/pkg', 'src/bar/node_modules/dep']),
      );
    });

    it('returns an empty set when no dir looks like node_modules', () => {
      expect(defaultCollapsedDirs(['src/foo', 'src/bar'])).toEqual(new Set());
    });
  });
});
