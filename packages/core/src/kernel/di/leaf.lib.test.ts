import { Container, injectable } from '@needle-di/core';
import { describe, expect, it } from 'vitest';

import { Config } from '../../built-in-service';
import { ZeltAppConfigurationError } from '../errors';
import { getLeaf, isLeafClass, overrideLeaf, registerAsLeaf, resolveLeaf } from './leaf.lib';

describe('leaf mechanism', () => {
  describe('registerAsLeaf / isLeafClass', () => {
    it('returns false for unregistered class', () => {
      class NotLeaf {}
      expect(isLeafClass(NotLeaf)).toBe(false);
    });

    it('returns true after registerAsLeaf', () => {
      @injectable()
      class LeafClass {}
      registerAsLeaf(LeafClass);
      expect(isLeafClass(LeafClass)).toBe(true);
    });

    it('returns true for child of registered class', () => {
      @injectable()
      class ParentLeaf {}
      registerAsLeaf(ParentLeaf);

      @injectable()
      class ChildLeaf extends ParentLeaf {}

      expect(isLeafClass(ChildLeaf)).toBe(true);
    });

    it('returns true for grandchild of registered class', () => {
      @injectable()
      class GrandparentLeaf {}
      registerAsLeaf(GrandparentLeaf);

      @injectable()
      class ParentLeaf extends GrandparentLeaf {}

      @injectable()
      class GrandchildLeaf extends ParentLeaf {}

      expect(isLeafClass(GrandchildLeaf)).toBe(true);
    });
  });

  describe('overrideLeaf / getLeaf', () => {
    it('binds root class on first call', () => {
      @injectable()
      class RootConfig {
        get value() {
          return 'root';
        }
      }
      registerAsLeaf(RootConfig);

      const container = new Container();
      overrideLeaf(container, RootConfig);

      expect(getLeaf(container, RootConfig).value).toBe('root');
    });

    it('binds child class as override', () => {
      @injectable()
      class BaseConfig {
        get value() {
          return 'base';
        }
      }
      registerAsLeaf(BaseConfig);

      @injectable()
      class ChildConfig extends BaseConfig {
        override get value() {
          return 'child';
        }
      }
      registerAsLeaf(ChildConfig);

      const container = new Container();
      overrideLeaf(container, ChildConfig);

      expect(getLeaf(container, BaseConfig).value).toBe('child');
    });

    it('resolves directly requested config subclass without changing ancestor token', () => {
      @Config
      class ConfigC {
        get value() {
          return 'c';
        }
      }

      @Config
      class ConfigB extends ConfigC {
        override get value() {
          return 'b';
        }
      }

      const container = new Container();

      const firstRoot = getLeaf(container, ConfigC);
      const directChild = getLeaf(container, ConfigB);
      const secondRoot = getLeaf(container, ConfigC);

      expect(firstRoot.value).toBe('c');
      expect(directChild.value).toBe('b');
      expect(secondRoot).toBe(firstRoot);
    });

    it('respects fallback option', () => {
      @injectable()
      class FallbackConfig {
        get value() {
          return 'fallback';
        }
      }
      registerAsLeaf(FallbackConfig);

      @injectable()
      class UserConfig extends FallbackConfig {
        override get value() {
          return 'user';
        }
      }
      registerAsLeaf(UserConfig);

      const container = new Container();
      overrideLeaf(container, UserConfig);
      overrideLeaf(container, FallbackConfig, { fallback: true });

      expect(getLeaf(container, FallbackConfig).value).toBe('user');
    });

    it('last bind wins for multiple overrides', () => {
      @injectable()
      class MultiBase {
        get value() {
          return 'base';
        }
      }
      registerAsLeaf(MultiBase);

      @injectable()
      class FirstChild extends MultiBase {
        override get value() {
          return 'first';
        }
      }
      registerAsLeaf(FirstChild);

      @injectable()
      class SecondChild extends MultiBase {
        override get value() {
          return 'second';
        }
      }
      registerAsLeaf(SecondChild);

      const container = new Container();
      overrideLeaf(container, FirstChild);
      overrideLeaf(container, SecondChild);

      expect(getLeaf(container, MultiBase).value).toBe('second');
    });

    it('returns singleton per container', () => {
      @injectable()
      class SingletonConfig {
        id = Math.random();
      }
      registerAsLeaf(SingletonConfig);

      const container = new Container();
      overrideLeaf(container, SingletonConfig);

      const first = getLeaf(container, SingletonConfig);
      const second = getLeaf(container, SingletonConfig);
      expect(first).toBe(second);
    });
  });

  describe('resolveLeaf', () => {
    it('forces instantiation of leaf class', () => {
      let instantiated = false;

      @injectable()
      class SideEffectConfig {
        constructor() {
          instantiated = true;
        }
      }
      registerAsLeaf(SideEffectConfig);

      const container = new Container();
      overrideLeaf(container, SideEffectConfig);

      expect(instantiated).toBe(false);
      resolveLeaf(container, SideEffectConfig);
      expect(instantiated).toBe(true);
    });
  });

  describe('abstract leaf defaults', () => {
    it('throws a config error when an abstract leaf has no concrete implementation', () => {
      abstract class AbstractConfig {}
      registerAsLeaf(AbstractConfig, { abstract: true });

      const container = new Container();

      expect(() => getLeaf(container, AbstractConfig)).toThrow(ZeltAppConfigurationError);
      expect(() => getLeaf(container, AbstractConfig)).toThrow(
        'Abstract config class AbstractConfig requires a concrete config class',
      );
    });
  });
});
