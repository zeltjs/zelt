import { Container, InjectionToken, inject, injectable } from '@needle-di/core';
import { describe, expect, it, vi } from 'vitest';

import { getTransient, isTransientClass, registerAsTransient } from './transient.lib';

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
      const unbind = vi.spyOn(container, 'unbind');

      getTransient(container, CleanupTest);
      getTransient(container, CleanupTest);

      expect(unbind).toHaveBeenCalledTimes(2);
      expect(unbind).toHaveBeenCalledWith(expect.any(InjectionToken));
      for (const [token] of unbind.mock.calls) {
        expect(container.has(token)).toBe(false);
      }
    });
  });
});
