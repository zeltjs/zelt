import { describe, expect, it } from 'vitest';

import { ZeltLifecycleStateError } from '../errors';
import { createReadyValue, disposeReadyValue, sealReadyValue } from './ready-value.lib';

const assignClient = (target: { client: unknown }): void => {
  target.client = 'modified';
};

describe('ReadyValue', () => {
  describe('createReadyValue', () => {
    it('creates a pending ReadyValue', () => {
      const ready = createReadyValue<{ client: string }>();
      expect(ready).toBeDefined();
    });
  });

  describe('pending state', () => {
    it('throws when accessing property before seal', () => {
      const ready = createReadyValue<{ client: string }>();
      expect(() => ready.client).toThrow(ZeltLifecycleStateError);
      expect(() => ready.client).toThrow(/before startup/);
    });

    it('throws when accessing unknown property before seal', () => {
      const ready = createReadyValue<{ client: string }>();
      expect(() => {
        void Reflect.get(ready, 'unknown');
      }).toThrow(ZeltLifecycleStateError);
    });
  });

  describe('sealReadyValue', () => {
    it('seals the ReadyValue with provided values', () => {
      const ready = createReadyValue<{ client: string; pool: number }>();
      sealReadyValue(ready, { client: 'test-client', pool: 42 });

      expect(ready.client).toBe('test-client');
      expect(ready.pool).toBe(42);
    });

    it('makes properties readonly after seal', () => {
      const ready = createReadyValue<{ client: string }>();
      sealReadyValue(ready, { client: 'test' });

      expect(() => {
        assignClient(ready);
      }).toThrow();
    });

    it('throws when sealing already sealed ReadyValue', () => {
      const ready = createReadyValue<{ client: string }>();
      sealReadyValue(ready, { client: 'test' });

      expect(() => sealReadyValue(ready, { client: 'another' })).toThrow(ZeltLifecycleStateError);
    });

    it('throws when accessing unknown property after seal', () => {
      const ready = createReadyValue<{ client: string }>();
      sealReadyValue(ready, { client: 'test' });

      expect(() => {
        void Reflect.get(ready, 'unknown');
      }).toThrow(ZeltLifecycleStateError);
      expect(() => {
        void Reflect.get(ready, 'unknown');
      }).toThrow(/unknown property/);
    });
  });

  describe('disposeReadyValue', () => {
    it('throws when accessing property after dispose', () => {
      const ready = createReadyValue<{ client: string }>();
      sealReadyValue(ready, { client: 'test' });
      disposeReadyValue(ready);

      expect(() => ready.client).toThrow(ZeltLifecycleStateError);
      expect(() => ready.client).toThrow(/after shutdown/);
    });

    it('is idempotent', () => {
      const ready = createReadyValue<{ client: string }>();
      sealReadyValue(ready, { client: 'test' });

      disposeReadyValue(ready);
      expect(() => disposeReadyValue(ready)).not.toThrow();
    });
  });

  describe('type safety', () => {
    it('infers correct types from seal value', () => {
      const ready = createReadyValue<{ num: number; str: string }>();
      sealReadyValue(ready, { num: 123, str: 'hello' });

      const num: number = ready.num;
      const str: string = ready.str;

      expect(num).toBe(123);
      expect(str).toBe('hello');
    });
  });
});
