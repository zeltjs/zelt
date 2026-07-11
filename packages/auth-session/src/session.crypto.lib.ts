const encoder = new TextEncoder();

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
};

const fromBase64Url = (value: string): Uint8Array<ArrayBuffer> => {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const importHmacKey = (secret: string, usage: KeyUsage): Promise<CryptoKey> =>
  crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    usage,
  ]);

export const generateSessionId = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
};

export const signSessionId = async (sessionId: string, secret: string): Promise<string> => {
  const key = await importHmacKey(secret, 'sign');
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(sessionId));
  return `${sessionId}.${toBase64Url(new Uint8Array(signature))}`;
};

export const verifyAndExtractSessionId = async (
  signedId: string,
  secret: string,
): Promise<string | null> => {
  const parts = signedId.split('.');
  if (parts.length !== 2) {
    return null;
  }

  const sessionId = parts[0];
  const signature = parts[1];
  if (
    sessionId === undefined ||
    signature === undefined ||
    sessionId.length === 0 ||
    !/^[A-Za-z0-9_-]{43}$/.test(signature)
  ) {
    return null;
  }

  const key = await importHmacKey(secret, 'verify');
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    fromBase64Url(signature),
    encoder.encode(sessionId),
  );
  return valid ? sessionId : null;
};
