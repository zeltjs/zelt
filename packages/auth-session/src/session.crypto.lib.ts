import { createHmac, randomBytes } from 'node:crypto';

export const generateSessionId = (): string => {
  return randomBytes(32).toString('hex');
};

export const signSessionId = (sessionId: string, secret: string): string => {
  const signature = createHmac('sha256', secret).update(sessionId).digest('base64url');
  return `${sessionId}.${signature}`;
};

export const verifyAndExtractSessionId = (signedId: string, secret: string): string | null => {
  const parts = signedId.split('.');
  if (parts.length !== 2) {
    return null;
  }

  const sessionId = parts[0];
  const signature = parts[1];
  if (sessionId === undefined || signature === undefined) {
    return null;
  }

  const expectedSignature = createHmac('sha256', secret).update(sessionId).digest('base64url');

  if (signature !== expectedSignature) {
    return null;
  }

  return sessionId;
};
