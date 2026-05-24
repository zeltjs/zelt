import { Container, inject, injectable } from '@needle-di/core';
import { describe, expect, it } from 'vitest';

import { getTransient, isTransientClass, registerAsTransient } from './transient';

describe('transient mechanism', () => {
  describe('registerAsTransient / isTransientClass', () => {
    it('returns false for unregistered class', () => {
      class NotTransient {}
      expect(isTransientClass(NotTransient)).toBe(false);
    });

    it('returns true after registerAsTransient', () => {
      @injectable()
      class TransientClass {}
      registerAsTransient(TransientClass);
      expect(isTransientClass(TransientClass)).toBe(true);
    });
  });

  describe('getTransient', () => {
    it('returns new instance each time', () => {
      @injectable()
      class TransientService {}
      registerAsTransient(TransientService);

      const container = new Container();
      const instance1 = getTransient(container, TransientService);
      const instance2 = getTransient(container, TransientService);

      expect(instance1).not.toBe(instance2);
    });

    it('resolves dependencies as singletons', () => {
      @injectable()
      class Dependency {
        id = Math.random();
      }

      @injectable()
      class TransientService {
        constructor(readonly dep: Dependency = inject(Dependency)) {}
      }
      registerAsTransient(TransientService);

      const container = new Container();
      const instance1 = getTransient(container, TransientService);
      const instance2 = getTransient(container, TransientService);

      expect(instance1).not.toBe(instance2);
      expect(instance1.dep).toBe(instance2.dep);
    });

    it('cleans up token after resolution', () => {
      @injectable()
      class CleanupTest {}
      registerAsTransient(CleanupTest);

      const container = new Container();
      // If unbind is omitted, the second call throws "already constructed" error
      expect(() => {
        getTransient(container, CleanupTest);
        getTransient(container, CleanupTest);
      }).not.toThrow();
    });
  });
});
