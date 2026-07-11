import { describe, expect, it } from 'vitest';

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
    it('should sign and verify a session ID', async () => {
      const sessionId = generateSessionId();
      const signed = await signSessionId(sessionId, secret);

      expect(signed).toContain('.');
      expect(signed.startsWith(sessionId)).toBe(true);

      const extracted = await verifyAndExtractSessionId(signed, secret);
      expect(extracted).toBe(sessionId);
    });

    it('should preserve the existing HMAC-SHA-256 Base64URL format', async () => {
      await expect(signSessionId('session-123', secret)).resolves.toBe(
        'session-123.oaU0Ut7Fi0EnHT67P1a8hnJTIpEH8jGrbSnLPshkFHE',
      );
    });

    it('should return null for invalid format', async () => {
      await expect(verifyAndExtractSessionId('no-dot-here', secret)).resolves.toBeNull();
      await expect(verifyAndExtractSessionId('too.many.dots', secret)).resolves.toBeNull();
    });

    it('should return null for tampered signature', async () => {
      const sessionId = generateSessionId();
      const signed = await signSessionId(sessionId, secret);
      const tampered = `${signed.slice(0, -5)}xxxxx`;

      await expect(verifyAndExtractSessionId(tampered, secret)).resolves.toBeNull();
    });

    it('should return null for wrong secret', async () => {
      const sessionId = generateSessionId();
      const signed = await signSessionId(sessionId, secret);

      await expect(verifyAndExtractSessionId(signed, 'wrong-secret')).resolves.toBeNull();
    });
  });
});
