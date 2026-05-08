import { describe, it, expect } from 'vitest';

import { generateSessionId, signSessionId, verifyAndExtractSessionId } from './session.crypto.lib';

describe('session.crypto', () => {
  const secret = 'test-secret-key';

  describe('generateSessionId', () => {
    it('should generate a 64-character hex string', () => {
      const id = generateSessionId();
      expect(id).toHaveLength(64);
      expect(/^[0-9a-f]+$/.test(id)).toBe(true);
    });

    it('should generate unique IDs', () => {
      const ids = new Set(Array.from({ length: 100 }, () => generateSessionId()));
      expect(ids.size).toBe(100);
    });
  });

  describe('signSessionId / verifyAndExtractSessionId', () => {
    it('should sign and verify a session ID', () => {
      const sessionId = generateSessionId();
      const signed = signSessionId(sessionId, secret);

      expect(signed).toContain('.');
      expect(signed.startsWith(sessionId)).toBe(true);

      const extracted = verifyAndExtractSessionId(signed, secret);
      expect(extracted).toBe(sessionId);
    });

    it('should return null for invalid format', () => {
      expect(verifyAndExtractSessionId('no-dot-here', secret)).toBeNull();
      expect(verifyAndExtractSessionId('too.many.dots', secret)).toBeNull();
    });

    it('should return null for tampered signature', () => {
      const sessionId = generateSessionId();
      const signed = signSessionId(sessionId, secret);
      const tampered = `${signed.slice(0, -5)}xxxxx`;

      expect(verifyAndExtractSessionId(tampered, secret)).toBeNull();
    });

    it('should return null for wrong secret', () => {
      const sessionId = generateSessionId();
      const signed = signSessionId(sessionId, secret);

      expect(verifyAndExtractSessionId(signed, 'wrong-secret')).toBeNull();
    });
  });
});
